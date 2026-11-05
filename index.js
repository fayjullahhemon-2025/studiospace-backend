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
  const base = (process.env.CLIENT_URL).replace(/\/+$/, '');
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
        const { category, limit, ownerEmail, sortBy, featured } = req.query;
        let query = {};
        if (category) { query.category = category; }
        if (ownerEmail) { query.ownerEmail = ownerEmail; }

        let sortOption = { _id: -1 };
        if (
            sortBy === 'rating' ||
            sortBy === 'top-rated' ||
            featured === 'true' ||
            (!sortBy && limit === '6')
        ) {
            sortOption = { rating: -1, reviewCount: -1, _id: -1 };
        } else if (sortBy === 'newest') {
            sortOption = { _id: -1 };
        }

        let cursor = studiosCollection.find(query).sort(sortOption);
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

    let amenities = req.body.amenities;
    if (typeof amenities === 'string') {
      try {
        amenities = JSON.parse(amenities);
      } catch {
        amenities = [amenities];
      }
    }

    // Process up to 5 photos
    let images = req.body.images;
    if (typeof images === 'string') {
      try {
        images = JSON.parse(images);
      } catch {
        images = [images];
      }
    }
    if (!Array.isArray(images) || images.length === 0) {
      images = imageUrl ? [imageUrl] : [];
    } else {
      images = images.filter(u => typeof u === 'string' && u.trim().length > 0);
      if (imageUrl && !images.includes(imageUrl)) {
        images.unshift(imageUrl);
      }
    }
    images = images.slice(0, 5);
    if (!imageUrl && images.length > 0) {
      imageUrl = images[0];
    }

    if (!imageUrl && images.length === 0) {
      return res.status(400).send({ success: false, message: 'Studio image is required (upload file or provide URL).' });
    }

    const studioData = {
      ...req.body,
      image: imageUrl,
      images,
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

    if (updateData.images !== undefined) {
      let imgs = updateData.images;
      if (typeof imgs === 'string') {
        try {
          imgs = JSON.parse(imgs);
        } catch {
          imgs = [imgs];
        }
      }
      if (Array.isArray(imgs)) {
        updateData.images = imgs.filter(u => typeof u === 'string' && u.trim().length > 0).slice(0, 5);
        if (updateData.images.length > 0 && !updateData.image) {
          updateData.image = updateData.images[0];
        }
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

// Helper: Booking end datetime (handles end hours >= 24, e.g. "30:00")
function getBookingEndDateTime(booking) {
    if (!booking || !booking.bookingDate || !booking.endTime) return null;
    const [endHour, endMinute] = String(booking.endTime).split(':').map((v) => parseInt(v, 10));
    const end = new Date(`${booking.bookingDate}T00:00:00`);
    if (Number.isNaN(end.getTime())) return null;
    end.setHours(Number.isNaN(endHour) ? 0 : endHour, Number.isNaN(endMinute) ? 0 : endMinute, 0, 0);
    return end;
}

// Lazy transition: Pending/Confirmed bookings whose end time has passed become Completed
async function completeExpiredBookings() {
    try {
        const candidates = await bookingsCollection
            .find({ status: { $in: ['Pending', 'Confirmed'] } })
            .toArray();
        const expiredIds = candidates
            .filter((booking) => {
                const end = getBookingEndDateTime(booking);
                return end && end < new Date();
            })
            .map((booking) => booking._id);
        if (expiredIds.length === 0) return;
        const result = await bookingsCollection.updateMany(
            { _id: { $in: expiredIds } },
            { $set: { status: 'Completed' } }
        );
        if (result.modifiedCount > 0) {
            console.log(`Auto-completed ${result.modifiedCount} finished booking(s).`);
        }
    } catch (err) {
        console.error('Failed to auto-complete expired bookings:', err.message);
    }
}

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

        await completeExpiredBookings();
        const result = await bookingsCollection.find({ userEmail: email }).toArray();
        res.send({ success: true, data: result });
    } catch (err) {
        res.status(500).send({ success: false, message: err.message });
    }
});

// Bookings made for the host's own studios (host approval inbox)
app.get('/bookings/host/:email', verifyToken, async (req, res) => {
    try {
        const { email } = req.params;
        if (!email) {
            return res.status(400).send({ success: false, message: "Email is required" });
        }
        if (req.user?.email && req.user.email !== email) {
            return res.status(403).send({ success: false, message: "Forbidden access." });
        }

        await completeExpiredBookings();

        const ownedStudios = await studiosCollection
            .find({ ownerEmail: email })
            .project({ _id: 1 })
            .toArray();
        const ownedIds = ownedStudios.map((studio) => studio._id.toString());

        const result = await bookingsCollection
            .find({ studioId: { $in: ownedIds } })
            .sort({ createdAt: -1 })
            .toArray();
        res.send({ success: true, data: result });
    } catch (err) {
        res.status(500).send({ success: false, message: err.message });
    }
});

// Host confirms a pending booking on one of their studios
app.patch('/bookings/:id/confirm', verifyToken, async (req, res) => {
    try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
            return res.status(400).send({ success: false, message: 'Invalid booking id.' });
        }

        const booking = await bookingsCollection.findOne({ _id: new ObjectId(id) });
        if (!booking) {
            return res.status(404).send({ success: false, message: 'Booking not found.' });
        }
        if (!booking.studioId || !ObjectId.isValid(booking.studioId)) {
            return res.status(400).send({ success: false, message: 'Booking has no valid associated studio.' });
        }

        const studio = await studiosCollection.findOne({ _id: new ObjectId(booking.studioId) });
        if (!studio) {
            return res.status(404).send({ success: false, message: 'Associated studio not found.' });
        }
        if (studio.ownerEmail !== req.user.email) {
            return res.status(403).send({ success: false, message: 'Unauthorized action: Only the studio host can confirm this booking.' });
        }
        if (booking.status !== 'Pending') {
            return res.status(400).send({ success: false, message: 'Only pending bookings can be confirmed.' });
        }

        const result = await bookingsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status: 'Confirmed' } }
        );
        res.send({ success: true, message: 'Booking confirmed successfully!', data: result });
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
export default app