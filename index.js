// index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const xlsx = require('xlsx');
const nodemailer = require('nodemailer');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Configuración de multer para almacenar el archivo en memoria
const storage = multer.memoryStorage();
const upload = multer({ storage });

const transporter = nodemailer.createTransport({
  pool: true,                   // habilita pool de conexiones
  maxConnections: 5,            // cuántas conexiones paralelas permitimos
  maxMessages: 100,             // cuántos mensajes por conexión antes de reciclar
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});


// Endpoint para subir el archivo Excel y parsearlo
app.post('/upload', upload.single('file'), (req, res) => {
  try {
    // Lee el archivo desde el buffer
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0]; // Usamos la primera hoja
    const sheet = workbook.Sheets[sheetName];
    // Convierte la hoja a JSON; se puede configurar para tomar la primera fila como header
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    // Separa el header de los registros
    const headers = data[0];
    const records = data.slice(1).map((row) => {
      let record = {};
      headers.forEach((header, index) => {
        record[header] = row[index];
      });
      // Agregamos una propiedad para seleccionar el registro en el front-end
      record.selected = false;
      return record;
    });

    res.json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint para enviar correos a los emails seleccionados
app.post('/send-email', upload.single('attachment'), async (req, res) => {
  let { emails, names, subject, messageTemplate } = req.body;

  console.log('Emails:', emails);
  console.log('Nombres:', names);

  // Asegurarnos de parsear el JSON si viene como string
  if (typeof emails === 'string') {
    try {
      emails = JSON.parse(emails);
    } catch {
      return res.status(400).json({ success: false, error: 'Formato de emails inválido' });
    }
  }

  if (typeof names === 'string') {
    try {
      names = JSON.parse(names);
    } catch {
      return res.status(400).json({ success: false, error: 'Formato de nombres inválido' });
    }
  }

  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ success: false, error: 'No hay correos para enviar' });
  }

  // Preparamos el attachment UNA vez
  const attachments = [];
  if (req.file) {
    attachments.push({
      filename: req.file.originalname,
      content: req.file.buffer,
      contentType: req.file.mimetype
    });
  }

  try {
    // Enviamos cada lote (batch) con el mismo attachment y transporter pool
    for (let i = 0; i < emails.length; i++) {
      const to = emails[i];
      const name = names[i] || '';
      // Reemplazo simple del placeholder
      const personalizedText = messageTemplate.replace(/{{\s*nombre\s*}}/g, name);

      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to,
        subject,
        text: personalizedText,
        attachments
      });
    }
    res.json({ success: true, message: 'Correos enviados' });
  } catch (err) {
    console.error('Error enviando mails:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

async function sendEmailsInBatches(transporter, emails, mailOptions, batchSize = 20) {
  for (let i = 0; i < emails.length; i += batchSize) {
    console.log('Enviando lote:', i, 'a', i + batchSize);
    const batch = emails.slice(i, i + batchSize);
    const batchPromises = batch.map(email => {
      console.log('Enviando correo a:', email);
      return transporter.sendMail({ ...mailOptions, to: email });
    });
    await Promise.all(batchPromises); // Espera a que termine el lote antes de continuar
  }
}

app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
