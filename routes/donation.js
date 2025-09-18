const express = require('express');
const router = express.Router();
const donations = [];

router.post('/offer', (req, res) => {
  const {userId, items, pickupWindow} = req.body;
  const offer = {id: donations.length+1, userId, items, pickupWindow, status:'available'};
  donations.push(offer);
  res.status(201).json(offer);
});

router.get('/', (req, res) => res.json(donations));

module.exports = router;
