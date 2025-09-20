const express = require('express');
const router = express.Router();

// placeholder: would call DeepSeek or other recipe API
router.post('/generate', (req, res) => {
  const {ingredients, preferences} = req.body;
  // return temporary suggestions
  res.json({
    suggestions: [
      {title: 'Temp Stir Fry', ingredients, steps: ['mix', 'cook']},
      {title: 'Temp Soup', ingredients, steps: ['boil', 'season']}
    ]
  });
});

module.exports = router;
