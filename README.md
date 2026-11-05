# StudioSpace 🎬 Studio & Production Space Sharing Marketplace

**StudioSpace** is a high-performance peer-to-peer (P2P) marketplace platform designed for content creators, photographers, filmmakers, podcasters, and musicians. Studio owners and hosts can list creative workspaces—ranging from cyclorama wall photography studios and cinema sound stages to acoustic podcast lounges, vocal recording suites, and art workshops. Creators can easily search, inspect dynamic hourly specifications, check availability with overlap protection, and reserve studio slots with transparent pricing and real-time booking management.

---

## 🔗 Project Links

* **Client Live Site URL:** [https://studiospace-frontend-steel.vercel.app/] 
* **Client GitHub Repository:** [https://github.com/fayjullahhemon-2025/studiospace-frontend.git]
* **Server GitHub Repository:** [https://github.com/fayjullahhemon-2025/studiospace-backend.git]

---

## ✨ Key Features & Highlights

1. **P2P Workspace Marketplace & Category Filtering:** Search, filter, and inspect studios across specialized production categories (`Photo Studios`, `Sound Stages`, `Podcast Lounges`, `Music Suites`, `Art Workshops`) with real-time query support.
2. **Double-Booking Collision Prevention (Challenge #2):** Smart MongoDB server-side validation algorithm that automatically prevents dynamic hourly slot overlaps for active `Confirmed` or `Pending` reservations.
3. **Secure Auth with HTTPOnly JWT Cookies (Challenge #1):** Full authentication system supporting email/password registration with strict validation rules ($\ge 6$ chars, 1 uppercase, 1 lowercase), Google OAuth, and secure token storage in HTTPOnly Cookies.
4. **Host Management & Full CRUD Operations:** Dynamic studio listing management allows studio owners to add, update, and delete their spaces using image upload links (ImgBB/Postimage) and custom modal confirmations.
5. **Interactive UI & Custom Toast Engine:** Completely responsive layout built with glassmorphism aesthetics, interactive hero carousels, custom branded skeleton loaders, dark/light theme switcher (Challenge #3), custom 404 page, and zero native browser alerts (powered by Sonner/React Hot Toast).

---

## 🛠️ Technology Stack

* **Frontend:** Next.js (App Router), Tailwind CSS, Shadcn UI, JavaScript / TypeScript, Swiper.js, Lucide / FontAwesome Icons.
* **Backend:** Node.js, Express.js, MongoDB Native Driver / Mongoose, JavaScript / TypeScript.
* **Authentication & Security:** BetterAuth / JWT (JSON Web Tokens), HTTPOnly Cookies, CORS Policy.
* **Storage & Hosting:** MongoDB Atlas Database, ImgBB API (Image Hosting), Vercel (Client Hosting), Render (Server Hosting).

---

## 🧪 Examiner Test Credentials

Use these credentials to evaluate protected routes, host listings, and booking capabilities:

* **Email:** `emon@gmail.com`
* **Password:** `Emon1234!`
* **Google Social Login:** Accessible via the "Google Account" button on the login modal.

---

## 💻 Local Setup Steps

Follow these steps to set up and run the project on your local machine:

### Prerequisites
* **Node.js:** v18.x or higher
* **npm:** v9.x or higher
* **MongoDB:** Local instance or MongoDB Atlas Connection String

### 1. Client Setup
```bash
# Clone the client repository
git clone https://github.com/your-username/studiospace-client.git
cd studiospace-client

# Install frontend dependencies
npm install

# Create environment configuration file
cp .env.example .env.local
```

Configure your `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

```bash
# Run the development client server
npm run dev
```

### 2. Server Setup
```bash
# Clone the server repository
git clone https://github.com/your-username/studiospace-server.git
cd studiospace-server

# Install backend dependencies
npm install

# Create environment configuration file
cp .env.example .env
```

Configure your `.env`:
```env
PORT=5000
MONGO_CLIENT_URL=mongodb+srv://<username>:<password>@cluster0.example.mongodb.net/studioSpaceDB?retryWrites=true&w=majority
JWT_SECRET=studiospace_secret_jwt_key_2026
CLIENT_URL=http://localhost:3000
NODE_ENV=development
```

```bash
# Start the backend server
npm start
```

Your client application will be running at `http://localhost:3000` and the server at `http://localhost:5000`.