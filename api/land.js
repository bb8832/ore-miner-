// Coastline polygons for the map (generated once per instance from Natural Earth; cached by the CDN).
module.exports = (req, res) => {
  const { land } = require('../lib/land');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
  res.end(JSON.stringify(land));
};
