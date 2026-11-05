import express from 'express'
import cors from 'cors'
import { MongoClient, ObjectId } from 'mongodb'
import dotenv from 'dotenv'
dotenv.config()
const app = express()
const port = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

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

app.get('/',(req,res)=>{
    res.send('SERVER is running Successfully')
})

//auth reviews
app.get('/auth-reviews',async(req,res)=>{
    const cursor = authReviews.find()
    const result = await cursor.toArray()
    res.send(result)
})
//banner images
app.get('/banner-images',async(req,res)=>{
    const cursor = bannerImages.find()
    const result = await cursor.toArray()
    res.send(result)
})
// Get All Studios (Supports category, ownerEmail filtering & limit for homepage)
app.get('/studios', async (req, res) => {
    try {
        const { category, limit, ownerEmail } = req.query;
        let query = {};
        if (category) {
            query.category = category;
        }
        if (ownerEmail) {
            query.ownerEmail = ownerEmail;
        }

        let cursor = studiosCollection.find(query).sort({ _id: -1 });
        if (limit) {
            cursor = cursor.limit(parseInt(limit));
        }
        const result = await cursor.toArray();
        res.send({ success: true, data: result });
    } catch (err) {
        res.status(500).send({ success: false, message: err.message });
    }
});
// Get Single Studio Details
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

// Add New Studio
app.post('/studios', async (req, res) => {
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

// Update Studio Details
app.patch('/studios/:id', async (req, res) => {
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

// Delete Studio
app.delete('/studios/:id', async (req, res) => {
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


// Create Booking
app.post('/bookings', async (req, res) => {
    try {
        const { studioId, studioTitle, bookingDate, startTime, endTime, totalAmount } = req.body;

        // Challenge 2: Check for overlapping Confirmed/Pending bookings
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

        const userEmail = req.user?.email || req.body.userEmail || req.headers['x-user-email'];
        const userName = req.user?.name || req.body.userName || req.headers['x-user-name'] || 'Studio Creator';

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
// Get User's Bookings (Protected)
app.get('/bookings/:email', async (req, res) => {
    try {
        const { email } = req.params; 
        if (!email) {
            return res.status(400).send({ success: false, message: "Email is required" });
        }
        const result = await bookingsCollection.find({ userEmail: email }).toArray();
        res.send({ success: true, data: result });
    } catch (err) {
        res.status(500).send({ success: false, message: err.message });
    }
});



const verifyToken = (req, res, next) => {
    const email = req.user?.email || req.headers['x-user-email'] || req.body?.userEmail || req.query?.email;
    if (email) {
        req.user = { email };
        return next();
    }
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
        req.user = { email: token };
        return next();
    }
    return res.status(401).send({ success: false, message: 'Unauthorized access. User email or token required.' });
};

// Cancel Booking (Protected)
app.patch('/bookings/:id/cancel', async (req, res) => {
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
app.listen(port,()=>{
    console.log(`Server is running on port ${port}`)
})