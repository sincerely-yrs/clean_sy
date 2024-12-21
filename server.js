require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const { Readable } = require('stream');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Configure multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Google Drive API setup
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_KEY_FILE,
  scopes: ['https://www.googleapis.com/auth/drive.file'],
});
const drive = google.drive({ version: 'v3', auth });

// Function to create a folder in Google Drive
async function createFolder(folderName, parentFolderId) {
  try {
    const folderMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    };

    const response = await drive.files.create({
      requestBody: folderMetadata,
      fields: 'id, name',
    });

    return response.data.id; // Return folder ID
  } catch (error) {
    console.error('Error creating folder:', error);
    throw error;
  }
}

// Function to upload a file to Google Drive
async function uploadToDrive(file, folderId) {
  try {
    const bufferStream = new Readable();
    bufferStream.push(file.buffer);
    bufferStream.push(null);

    const response = await drive.files.create({
      requestBody: {
        name: file.originalname,
        parents: [folderId],
      },
      media: {
        mimeType: file.mimetype || 'application/octet-stream',
        body: bufferStream,
      },
      fields: 'id',
    });

    return response.data;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
}

// Function to create and upload a .txt file to Google Drive
async function uploadTextFile(text, folderId) {
  try {
    if (!text || text.trim() === '') {
      console.log('No text provided for .txt file creation.');
      return null; // Skip if text is empty
    }

    const textStream = new Readable();
    textStream.push(text);
    textStream.push(null);

    const response = await drive.files.create({
      requestBody: {
        name: 'comments.txt',
        parents: [folderId],
      },
      media: {
        mimeType: 'text/plain',
        body: textStream,
      },
      fields: 'id',
    });

    return response.data;
  } catch (error) {
    console.error('Error uploading .txt file:', error);
    throw error;
  }
}

// Function to send email notification
async function sendEmail(to, folderName) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject: 'File Upload Notification',
      text: `Your files and text have been uploaded to the folder: ${folderName}.`,
    };

    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully');
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

// File upload endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const parentFolderId = process.env.GOOGLE_FOLDER_ID;
    const file = req.file;
    const textInput = req.body.text;
    const email = req.body.email;

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded.' });
    }

    // Create a new folder
    console.time('Folder Creation');
    const folderName = new Date().toISOString();
    const newFolderId = await createFolder(folderName, parentFolderId);
    console.timeEnd('Folder Creation');

    // Upload the file
    console.time('File Upload');
    const fileResponse = await uploadToDrive(file, newFolderId);
    console.timeEnd('File Upload');

    // Upload the .txt file
    console.time('Text File Upload');
    const textFileResponse = await uploadTextFile(textInput, newFolderId);
    console.timeEnd('Text File Upload');

    // Send email only after everything is complete
    if (email) {
      console.time('Email Sending');
      await sendEmail(email, folderName);
      console.timeEnd('Email Sending');
    }

    // Respond to the client
    res.status(200).json({
      message: 'Files uploaded successfully!',
      folderId: newFolderId,
      folderName: folderName,
      fileId: fileResponse.id,
      textFileId: textFileResponse ? textFileResponse.id : null,
    });
  } catch (error) {
    console.error('Error during upload:', error);
    res.status(500).json({ message: 'File upload failed.', error: error.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
