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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true); // Accept the file
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, PDF, DOC, and DOCX are allowed.'));
    }
  },
});

// Google Drive API setup
const auth = new google.auth.GoogleAuth({
 // keyFile: process.env.GOOGLE_KEY_FILE,
  credentials: {
    type: process.env.GOOGLE_TYPE,
    project_id: process.env.GOOGLE_PROJECT_ID,
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Replace escaped \n with actual newlines
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_CLIENT_ID,
    auth_uri: process.env.GOOGLE_AUTH_URI,
    token_uri: process.env.GOOGLE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.GOOGLE_AUTH_PROVIDER_CERT,
    client_x509_cert_url: process.env.GOOGLE_CLIENT_CERT_URL,
  },
  scopes: ['https://www.googleapis.com/auth/drive.file'],
});
const drive = google.drive({ version: 'v3', auth });

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

    return response.data.id;
  } catch (error) {
    console.error('Error creating folder:', error);
    throw error;
  }
}

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

async function uploadTextFile(text, folderId) {
  try {
    if (!text || text.trim() === '') {
      console.log('No text provided for .txt file creation.');
      return null;
    }

    const textStream = new Readable();
    textStream.push(text);
    textStream.push(null);

    const response = await drive.files.create({
      requestBody: {
        name: 'text-input.txt',
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

async function sendEmail(to, folderName, folderId) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const folderLink = `https://drive.google.com/drive/folders/${folderId}`;
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject: 'File Upload Notification',
      text: `Your files and text have been uploaded to the folder: ${folderName}. You can access it here: ${folderLink}.`,
    };

    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully');
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

app.post('/upload', (req, res) => {
  upload.array('files', 5)(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }

    try {
      const parentFolderId = process.env.GOOGLE_FOLDER_ID;
      const files = req.files;
      const textInput = req.body.text;
      console.log('here');
      console.log(req.files);
      console.log(req.body);
      const email = 'sincerely.yrss@gmail.com';

      if (!files || files.length === 0) {
        return res.status(400).json({ message: 'No files uploaded.' });
      }

      const folderName = new Date().toISOString();
      console.time('Folder Creation');
      const newFolderId = await createFolder(folderName, parentFolderId);
      console.timeEnd('Folder Creation');


      console.time('File Upload');
      for (const file of files) {
        await uploadToDrive(file, newFolderId);
      }
      console.timeEnd('File Upload');

      console.time('Text File Upload');
      const textFileResponse = await uploadTextFile(textInput, newFolderId);
      console.timeEnd('Text File Upload');

      if (email) {
        await sendEmail(email, folderName, newFolderId);
      }

      res.status(200).json({
        message: 'Files uploaded successfully!',
        folderId: newFolderId,
        folderName: folderName,
      });
    } catch (error) {
      console.error('Error during upload:', error);
      res.status(500).json({ message: 'File upload failed.', error: error.message });
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
