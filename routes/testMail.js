import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'live.smtp.mailtrap.io',
  port: 587,
  auth: {
    user: 'smtp@mailtrap.io',
    pass: 'a458574ac65daf5a53656400db4f294e',
  },
  secure: false,
});

transporter.sendMail({
  from:  'hello@demomailtrap.co',
  to: 'testor804@gmail.com',
  subject: 'Mailtrap Test',
  text: 'Hello, this is a test',
}, (err, info) => {
  if (err) console.error('SMTP ERROR:', err);
  else console.log('Email sent:', info.response);
});
