// testing

document.addEventListener("DOMContentLoaded", () => {
  const mapEl = document.getElementById('map');
  if (!mapEl) return;

  const lat = parseFloat(mapEl.dataset.lat);
  const lng = parseFloat(mapEl.dataset.lng);
  const complaintType = mapEl.dataset.complaint;
  const descriptor = mapEl.dataset.desc;

  const coords = [lat, lng];
  const map = L.map('map').setView(coords, 16);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);

  L.marker(coords)
    .addTo(map)
    .bindPopup(`<b>${complaintType}</b><br>${descriptor}`)
    .openPopup();
});
