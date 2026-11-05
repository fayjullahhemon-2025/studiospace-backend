import express from 'express'
import cors from 'cors'
import { MongoClient } from 'mongodb'
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

app.listen(port,()=>{
    console.log(`Server is running on port ${port}`)
})