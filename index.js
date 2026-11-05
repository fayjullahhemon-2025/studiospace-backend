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
// Get All Studios (Supports category filtering & limit for homepage)
app.get('/studios', async (req, res) => {
    try {
        const { category, limit } = req.query;
        let query = {};
        if (category) {
            query.category = category;
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
// ==========================================
// 3. BOOKINGS & DOUBLE-BOOKING PREVENTION (Challenge 2)
// ==========================================

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
app.listen(port,()=>{
    console.log(`Server is running on port ${port}`)
})