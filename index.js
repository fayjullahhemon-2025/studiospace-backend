import express from 'express'
import cors from 'cors'
import { MongoClient, ObjectId } from 'mongodb'
import { jwtVerify, createRemoteJWKSet } from 'jose';
import dotenv from 'dotenv'
dotenv.config()
const app = express()
const port = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

//verifyToken middleware
const verifyToken = async(req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log(authHeader)
  if(!authHeader){
    return res.status(401).send({ msg: 'Unauthorized!' })
  }
  const token = authHeader.split(" ")[1]
  const JWKS = createRemoteJWKSet(
    new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
  )
  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload; 
    next()
  } catch (error) {
    return res.status(500).send({ msg: "Server Error" })
  }
}

const client = new MongoClient(process.env.MONGO_CLIENT_URL);
export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const connectedClient = await connectToMongoDB()
const db = connectedClient.db('studioSpaceDB')
const authReviews = db.collection('authPagesReviews')
const bannerImages = db.collection('bannerImages')
const studiosCollection = db.collection('studios')
const bookingsCollection = db.collection('bookings')

app.get('/', (req, res) => {
    res.send('SERVER is running Successfully')
})

// Public routes 
app.get('/auth-reviews', async (req, res) => {
    const cursor = authReviews.find()
    const result = await cursor.toArray()
    res.send(result)
})

app.get('/banner-images', async (req, res) => {
    const cursor = bannerImages.find()
    const result = await cursor.toArray()
    res.send(result)
})

app.get('/studios', async (req, res) => {
    try {
        const { category, limit, ownerEmail } = req.query;
        let query = {};
        if (category) { query.category = category; }
        if (ownerEmail) { query.ownerEmail = ownerEmail; }

        let cursor = studiosCollection.find(query).sort({ _id: -1 });
        if (limit) { cursor = cursor.limit(parseInt(limit)); }
        const result = await cursor.toArray();
        res.send({ success: true, data: result });
    } catch (err) {
        res.status(500).send({ success: false, message: err.message });
    }
});

app.get('/studios/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const studio = await studiosCollection.findOne({ _id: new ObjectId(id) });
        if (!studio) {
            return res.status(404).send({ success: false, message: 'Studio not found.' });
        }
        res.send({ success: true, data: studio });
    } catch (err) {
        res.status(500).send({ success: false, message: err.message });
    }
});


//  Protected Studio Routes
app.post('/studios', verifyToken, async (req, res) => {
    try {
        const studioData = {
            ...req.body,
            createdAt: new Date(),
        };
        const result = await studiosCollection.insertOne(studioData);
        res.status(201).send({ success: true, message: 'Studio listed successfully!', data: result });
    } catch (err) {
        res.status(500).send({ success: false, message: err.message });
    }
});

app.patch('/studios/:id', verifyToken, async (req, res) => {
    try {
        const id = req.params.id;
        const updateData = { ...req.body };
        delete updateData._id;
        const result = await studiosCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updateData }
        );
        res.send({ success: true, message: 'Studio updated successfully.', data: result });
    } catch (err) {
        res.status(500).send({ success: false, message: err.message });
    }
});

app.delete('/studios/:id', verifyToken, async (req, res) => {
    try {
        const id = req.params.id;
        const result = await studiosCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).send({ success: false, message: 'Studio not found.' });
        }
        res.send({ success: true, message: 'Studio deleted successfully.', data: result });
    } catch (err) {
        res.status(500).send({ success: false, message: err.message });
    }
});


//  Protected Booking Routes
app.post('/bookings', verifyToken, async (req, res) => {
    try {
        const { studioId, studioTitle, bookingDate, startTime, endTime, totalAmount } = req.body;

        const existingOverlap = await bookingsCollection.findOne({
            studioId,
            bookingDate,
            status: { $in: ['Confirmed', 'Pending'] },
            $or: [
                { startTime: { $lt: endTime }, endTime: { $gt: startTime } }
            ]
        });

        if (existingOverlap) {
            return res.status(409).send({ 
                success: false, 
                message: 'Double Booking Collision: This studio is already booked for the selected time slot.' 
            });
        }

       
        const userEmail = req.user?.email || req.body.userEmail;
        const userName = req.user?.name || req.body.userName || 'Studio User';

        const bookingData = {
            studioId,
            studioTitle,
            userEmail,
            userName,
            bookingDate,
            startTime,
            endTime,
            totalAmount,
            status: 'Pending',
            createdAt: new Date()
        };

        const result = await bookingsCollection.insertOne(bookingData);
        res.status(201).send({ success: true, message: 'Booking placed successfully!', data: result });
    } catch (err) {
        res.status(500).send({ success: false, message: err.message });
    }
});

app.get('/bookings/:email', verifyToken, async (req, res) => {
    try {
        const { email } = req.params; 
        if (!email) {
            return res.status(400).send({ success: false, message: "Email is required" });
        }
        if (req.user?.email && req.user.email !== email) {
            return res.status(403).send({ success: false, message: "Forbidden access." });
        }

        const result = await bookingsCollection.find({ userEmail: email }).toArray();
        res.send({ success: true, data: result });
    } catch (err) {
        res.status(500).send({ success: false, message: err.message });
    }
});

app.patch('/bookings/:id/cancel', verifyToken, async (req, res) => {
    try {
        const id = req.params.id;
        const booking = await bookingsCollection.findOne({ _id: new ObjectId(id) });

        if (!booking) {
            return res.status(404).send({ success: false, message: 'Booking not found.' });
        }
        if (booking.userEmail !== req.user.email) {
            return res.status(403).send({ success: false, message: 'Unauthorized action.' });
        }
        if (booking.status !== 'Pending') {
            return res.status(400).send({ success: false, message: 'Only pending bookings can be cancelled.' });
        }

        const result = await bookingsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status: 'Cancelled' } }
        );
        res.send({ success: true, message: 'Booking cancelled successfully!', data: result });
    } catch (err) {
        res.status(500).send({ success: false, message: err.message });
    }
});

app.delete('/bookings/:id', verifyToken, async (req, res) => {
    try {
        const id = req.params.id;
        const booking = await bookingsCollection.findOne({ _id: new ObjectId(id) });

        if (!booking) {
            return res.status(404).send({ success: false, message: 'Booking not found.' });
        }

        if (booking.userEmail !== req.user.email) {
            return res.status(403).send({ success: false, message: 'Unauthorized action: You can only delete your own bookings.' });
        }

        const result = await bookingsCollection.deleteOne({ _id: new ObjectId(id) });
        res.send({ success: true, message: 'Booking deleted successfully!', data: result });
    } catch (err) {
        res.status(500).send({ success: false, message: err.message });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`)
})