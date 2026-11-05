import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { MongoClient, ObjectId } from 'mongodb'
import { jwtVerify, createRemoteJWKSet } from 'jose';
import dotenv from 'dotenv'
dotenv.config()
const app = express()
const port = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

// Multer in-memory storage for handling image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 32 * 1024 * 1024, // 32MB max (ImgBB limit)
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WEBP, AVIF, GIF) are allowed.'), false);
    }
  },
});

// Helper: Forward image buffer to ImgBB using FormData
async function forwardImageToImgBB(fileBuffer, originalname, mimetype) {
  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) {
    throw new Error('IMGBB_API_KEY is not configured in server .env. Please add your ImgBB API key.');
  }

  const blob = new Blob([fileBuffer], { type: mimetype || 'image/jpeg' });
  const formData = new FormData();
  formData.append('image', blob, originalname || 'image.jpg');

  const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    const errorMsg = data?.error?.message || `ImgBB upload failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return {
    url: data.data.url,
    displayUrl: data.data.display_url,
    thumbUrl: data.data.thumb?.url,
    deleteUrl: data.data.delete_url,
    width: data.data.width,
    height: data.data.height,
    size: data.data.size,
  };
}

//verifyToken middleware
const getJwksUrl = () => {
  const base = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return new URL(`${base}/api/auth/jwks`);
};

let remoteJwks;
const getJWKS = () => {
  if (!remoteJwks) {
    remoteJwks = createRemoteJWKSet(getJwksUrl());
  }
  return remoteJwks;
};

const verifyToken = async(req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ success: false, msg: 'Unauthorized.' });
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).send({ success: false, msg: 'Unauthorized: Invalid Authorization header format.' });
  }

  const token = parts[1];
  if (!token || token === 'undefined' || token === 'null') {
    return res.status(401).send({ success: false, msg: 'Unauthorized: Invalid or missing token.' });
  }

  try {
    const JWKS = getJWKS();
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;
    next();
  } catch (error) {
    console.error("JWT verification error:", error.message);
    return res.status(401).send({ success: false, msg: "Invalid or expired token." });
  }
};

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


//  Image Upload Route (Uploads image directly to ImgBB via FormData)
app.post('/upload', verifyToken, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).send({ success: false, message: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).send({ success: false, message: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send({ success: false, message: 'No image file provided in "image" field.' });
    }

    const imgbbData = await forwardImageToImgBB(req.file.buffer, req.file.originalname, req.file.mimetype);
    res.status(200).send({
      success: true,
      message: 'Image uploaded successfully to ImgBB!',
      data: imgbbData,
    });
  } catch (err) {
    console.error('Image upload failed:', err.message);
    res.status(500).send({ success: false, message: err.message });
  }
});

//  Protected Studio Routes
app.post('/studios', verifyToken, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).send({ success: false, message: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    let imageUrl = req.body.image;

    // If a physical image file was uploaded with the multipart form, forward it to ImgBB
    if (req.file) {
      const uploadResult = await forwardImageToImgBB(req.file.buffer, req.file.originalname, req.file.mimetype);
      imageUrl = uploadResult.url;
    }

    if (!imageUrl) {
      return res.status(400).send({ success: false, message: 'Studio image is required (upload file or provide URL).' });
    }

    let amenities = req.body.amenities;
    if (typeof amenities === 'string') {
      try {
        amenities = JSON.parse(amenities);
      } catch {
        amenities = [amenities];
      }
    }

    const studioData = {
      ...req.body,
      image: imageUrl,
      ...(amenities ? { amenities } : {}),
      hourlyRate: req.body.hourlyRate ? Number(req.body.hourlyRate) : 0,
      securityDeposit: req.body.securityDeposit ? Number(req.body.securityDeposit) : 0,
      capacity: req.body.capacity ? Number(req.body.capacity) : 1,
      createdAt: new Date(),
    };

    const result = await studiosCollection.insertOne(studioData);
    res.status(201).send({
      success: true,
      message: 'Studio listed successfully!',
      data: result,
      imageUrl,
    });
  } catch (err) {
    res.status(500).send({ success: false, message: err.message });
  }
});

app.patch('/studios/:id', verifyToken, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).send({ success: false, message: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    const id = req.params.id;
    const updateData = { ...req.body };
    delete updateData._id;

    if (req.file) {
      const uploadResult = await forwardImageToImgBB(req.file.buffer, req.file.originalname, req.file.mimetype);
      updateData.image = uploadResult.url;
    }

    if (updateData.hourlyRate !== undefined) updateData.hourlyRate = Number(updateData.hourlyRate);
    if (updateData.securityDeposit !== undefined) updateData.securityDeposit = Number(updateData.securityDeposit);
    if (updateData.capacity !== undefined) updateData.capacity = Number(updateData.capacity);
    if (typeof updateData.amenities === 'string') {
      try {
        updateData.amenities = JSON.parse(updateData.amenities);
      } catch {
        updateData.amenities = [updateData.amenities];
      }
    }

    const result = await studiosCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );
    res.send({ success: true, message: 'Studio updated successfully.', data: result, imageUrl: updateData.image });
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