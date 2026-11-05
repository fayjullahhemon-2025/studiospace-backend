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
app.listen(port,()=>{
    console.log(`Server is running on port ${port}`)
})