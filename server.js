// server.js
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // Use bcryptjs instead of bcrypt
const bodyParser = require('body-parser');
const multer = require('multer'); // For file uploads
const path = require('path');
const fs = require('fs');
const winston = require('winston');
require('dotenv').config();

// Create Express app
const app = express();
app.use(bodyParser.json());

// Configure Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

// Configure Multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const orderId = req.body.orderId || 'default';
    const uploadDir = path.join(__dirname, 'uploads', orderId);
    // Create directory if it doesn't exist
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Use original filename; you can add timestamps if desired.
    cb(null, file.originalname);
  }
});

// Create the Multer instance (must be declared before routes that use it)
const upload = multer({ storage: storage });

// ----------------------
// Mongoose Models Setup
// ----------------------

// User Schema and Model
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});
const User = mongoose.model('User', userSchema);

// Drug Import Schema and Model
const drugImportSchema = new mongoose.Schema({
  orderNo: { type: String, required: true },
  drugName: { type: String, required: true },
  supplier: { type: String, required: true },
  date: { type: String, required: true },
  poNumber: { type: String, required: true },
  paymentMethod: { type: String, required: true },
  documents: { type: [String], required: true },
  status: { type: String, required: true },
});
const DrugImport = mongoose.model('DrugImport', drugImportSchema);

// Distribution Schema and Model
const distributionSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true, unique: true },
  trackingNumber: { type: String, required: true },
  customerName: { type: String, required: true },
  shippingAddress: { type: String, required: true },
  contactPhone: { type: String, required: true },
  contactEmail: { type: String, required: true },
  status: {
    type: String,
    required: true,
    enum: ['Pending', 'Shipped', 'In Transit', 'Out for Delivery', 'Delivered'],
    default: 'Pending',
  },
  orderDate: { type: Date, required: true, default: Date.now },
  productInfo: {
    description: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitWeight: { type: String, required: true },
    totalWeight: { type: String, required: true },
    dimensions: {
      length: { type: Number, required: true },
      width: { type: Number, required: true },
      height: { type: Number, required: true },
      unit: { type: String, required: true },
    },
  },
  analysis: {
    weightDistribution: { type: String, required: true },
    shippingClass: { type: String, required: true },
    handlingRequirements: [{ type: String }],
    specialInstructions: { type: String },
  },
  deliveryTimeline: [
    {
      event: { type: String, required: true },
      date: { type: Date, required: true },
      completed: { type: Boolean, default: false },
    },
  ],
  documents: [
    {
      title: { type: String, required: true },
      status: {
        type: String,
        required: true,
        enum: ['approved', 'pending', 'rejected'],
      },
    },
  ],
  location: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
  },
  signature: { type: String },
});
const Distribution = mongoose.model('Distribution', distributionSchema);

// ----------------------
// Express Routes
// ----------------------

// Login API


app.post('/', async (req, res) => {
    res.send('Welcome');
});


app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) {
      logger.error('Invalid username or password');
      return res.status(400).json({ message: 'Invalid username or password' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      logger.error('Invalid username or password');
      return res.status(400).json({ message: 'Invalid username or password' });
    }
    logger.info('Login successful');
    res.status(200).json({ message: 'Login successful' });
  } catch (error) {
    logger.error('Server error', error);
    res.status(500).json({ message: 'Server error', error });
  }
});

// Seed API for demo user
app.get('/seed', async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash('hp', 10);
    const newUser = new User({ username: 'harshal', password: hashedPassword });
    await newUser.save();
    res.status(201).json({ message: 'User seeded successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error seeding user', error });
  }
});

// Fetch Imports API
app.get('/import', async (req, res) => {
  try {
    const imports = await DrugImport.find();
    res.status(200).json(imports);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching imports', error });
  }
});

// New Import Endpoint (for demo)
app.post('/new_import', (req, res) => {
  const newImport = req.body;
  res.status(201).json(newImport);
});

// Fetch Distribution Details API
app.get('/distribution/:orderId', async (req, res) => {
  const { orderId } = req.params;
  try {
    const distributionOrder = await Distribution.findOne({ orderNumber: orderId });
    if (!distributionOrder) {
      logger.error('Distribution order not found');
      return res.status(404).json({ message: 'Distribution order not found' });
    }
    logger.info('Distribution order fetched successfully');
    res.status(200).json(distributionOrder);
  } catch (error) {
    logger.error('Error fetching distribution details', error);
    res.status(500).json({ message: 'Error fetching distribution details', error });
  }
});

// GET endpoint to fetch files for a given orderId from the uploads folder
app.get('/files/:orderId', (req, res) => {
  const orderId = req.params.orderId;
  const uploadDir = path.join(__dirname, 'uploads', orderId);
  
  if (!fs.existsSync(uploadDir)) {
    return res.status(404).json({ message: 'No files found for this order' });
  }
  
  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      logger.error('Error reading files:', err);
      return res.status(500).json({ message: 'Error reading files', error: err });
    }
    res.status(200).json({ files });
  });
});

// Seed API for demo drug imports
app.get('/seed1', async (req, res) => {
  try {
    const demoData = [
      {
        orderNo: 'ORD001',
        drugName: 'Paracetamol',
        supplier: 'PharmaCorp',
        date: '2025-01-10',
        poNumber: 'PO12345',
        paymentMethod: 'Credit',
        documents: ['COA.pdf', 'Invoice.pdf'],
        status: 'Shipped',
      },
      {
        orderNo: 'ORD002',
        drugName: 'Ibuprofen',
        supplier: 'HealthCare Supplies',
        date: '2025-01-12',
        poNumber: 'PO12346',
        paymentMethod: 'Bank Transfer',
        documents: ['COA.pdf', 'Invoice.pdf'],
        status: 'In Customs',
      },
      {
        orderNo: 'ORD003',
        drugName: 'Amoxicillin',
        supplier: 'MedLife Ltd',
        date: '2025-01-15',
        poNumber: 'PO12347',
        paymentMethod: 'Cash',
        documents: ['COA.pdf', 'Invoice.pdf', 'Shipping Label.pdf'],
        status: 'Delivered',
      },
    ];
    await DrugImport.insertMany(demoData);
    res.status(201).json({ message: 'Demo drug data seeded successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error seeding drug data', error });
  }
});

// Fetch Distributions API
app.get('/distribution', async (req, res) => {
  try {
    const distributions = await Distribution.find();
    res.status(200).json(distributions);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching distributions', error });
  }
});

// Place Distribution Order Endpoint without file uploads
app.post('/distributionadd', async (req, res) => {
  const orderData = req.body;
  try {
    const newOrder = new Distribution(orderData);
    await newOrder.save();
    res.status(200).json({ message: 'Order placed successfully', order: newOrder });
  } catch (error) {
    res.status(500).json({ message: 'Error placing order', error });
  }
});

// Place Distribution Order Endpoint with file uploads using Multer
app.post('/distributionadd1', upload.array('files'), async (req, res) => {
  const orderData = req.body;
  const files = req.files;
  try {
    const newOrder = new Distribution(orderData);
    await newOrder.save();
    if (files && files.length > 0) {
      const filePaths = files.map(file => file.path);
      newOrder.documents = filePaths.map(filePath => ({
        title: path.basename(filePath),
        status: 'pending',
      }));
      await newOrder.save();
    }
    res.status(200).json({ message: 'Order placed successfully', order: newOrder });
  } catch (error) {
    res.status(500).json({ message: 'Error placing order', error });
  }
});

// File upload endpoint
app.post('/upload', upload.array('files'), (req, res) => {
  const { orderId, trackingId } = req.body;
  const files = req.files;
  if (!files || files.length === 0) {
    logger.error('No files uploaded');
    return res.status(400).json({ message: 'No files uploaded' });
  }
  logger.info(`Files uploaded successfully for Order ID: ${orderId} & Tracking ID: ${trackingId}`);
  res.status(200).json({
    message: `Files uploaded successfully for Order ID: ${orderId} & Tracking ID: ${trackingId}`,
    files: files.map(file => file.path)
  });
});

// Serve Upload Page (GET) for QR Code scanning
app.get('/upload/:orderId/:trackingId', (req, res) => {
  const { orderId, trackingId } = req.params;
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Upload Documents for Order ${orderId}</title>
      <style>
        body { background: #1C1C1C; color: #fff; font-family: Arial, sans-serif; padding: 20px; }
        .container { max-width: 600px; margin: auto; }
        input[type="file"] { width: 100%; padding: 10px; margin: 20px 0; }
        button { background: #00796B; color: #fff; border: none; padding: 10px 20px; font-size: 16px; cursor: pointer; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Upload Documents for Order ${orderId}</h1>
        <p>Tracking ID: ${trackingId}</p>
        <form id="uploadForm" enctype="multipart/form-data" method="POST" action="/upload">
          <input type="hidden" name="orderId" value="${orderId}" />
          <input type="hidden" name="trackingId" value="${trackingId}" />
          <input type="file" name="files" multiple />
          <button type="submit">Upload Files</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

// ----------------------
// MongoDB Connection
// ----------------------
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => logger.info('Connected to MongoDB'))
  .catch((err) => logger.error('MongoDB connection error:', err));

// ----------------------
// Start the Server
// ----------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
