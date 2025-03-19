import express, { type Request, type Response } from 'express';
import bodyParser from 'body-parser';
import Midtrans from 'midtrans-client';
import cors from 'cors';
import admin from 'firebase-admin';


const app = express();
const port = process.env.PORT || 3000;

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n')
  })
});

// Enable CORS for a specific origin
app.use(
  cors({
    origin: ' https://e2d1-2001-448a-6070-395a-a15e-9cbf-7434-fc98.ngrok-free.app', // Allow only your frontend's URL
    methods: ['GET', 'POST'], // Allow specific HTTP methods
    allowedHeaders: ['Content-Type', 'Authorization'], // Allow specific headers
    credentials: true, // Allow cookies if needed
  })
);

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// Initialize Midtrans Snap
if (!process.env.SECRET || !process.env.NEXT_PUBLIC_CLIENT) {
  console.error('Midtrans keys (SECRET, NEXT_PUBLIC_CLIENT) are not defined in environment variables.');
  process.exit(1); // Exit the app if required variables are missing
}

const snap = new Midtrans.Snap({
  isProduction: false,
  serverKey: process.env.SECRET,
  clientKey: process.env.NEXT_PUBLIC_CLIENT,
});

// Define the POST route
app.post('/create-transaction', async (req: Request, res: Response): Promise<void> => {
  try {
    // Destructure and validate the request payload
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Invalid or empty items array' })
      return;
    }

    // Generate a unique order ID
    const orderId = `ORDER-${Date.now()}`;

    // Prepare item_details and calculate gross_amount
    const itemDetails = items.map((item) => {
      const { id, productName, price, quantity } = item;

      if (!productName || typeof price !== 'number' || typeof quantity !== 'number') {
        throw new Error('Each item must include productName, price (number), and quantity (number).');
      }

      return {
        id: id || `item-${Date.now()}`, // Assign a default ID if not provided
        name: productName,
        price: Math.round(price), // Ensure price is a whole number
        quantity: Math.round(quantity), // Ensure quantity is a whole number
      };
    });

    const grossAmount = itemDetails.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    // Prepare the parameter for Midtrans
    const parameter = {
      transaction_details: {
        order_id: orderId, // Unique order ID
        gross_amount: grossAmount, // Sum of all item_details
      },
      item_details: itemDetails,
    };

    console.log('Midtrans Parameter:', parameter);

    // Call Midtrans API to get the transaction token
    const token = await snap.createTransactionToken(parameter);
    console.log('Transaction Token:', token);

    // Send the token back to the client
    res.json({ token });
  } catch (error: any) {
    console.error('Midtrans Error:', error.message || error);
    res.status(500).json({ error: error.message || 'Failed to create transaction token' });
  }
});

// app.post('/send-notification', async (req, res) => {
//   try {
//     const { token, notification } = req.body;

//     await admin.messaging().send({
//       token,
//       notification,
//     });

//     console.log('Token Messaging : ', token)

//     res.status(200).json({ success: true });
//   } catch (error) {
//     console.error('Error sending notification:', error);
//     res.status(500).json({ error: 'Failed to send notification' });
//   }
// });

// Start the server
// Endpoint untuk mengirim notifikasi

app.post('/api/notify', async (req, res) => {
  const { token, orderDetails } = req.body;

  const message = {
    notification: {
      title: 'Pembayaran Berhasil!',
      body: `Order #${orderDetails.id} telah diproses`
    },
    token: token
  };

  console.log(message)

  try {
    const response = await admin.messaging().send(message);
    res.status(200).json({ success: true, response });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, error });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
