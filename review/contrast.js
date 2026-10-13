const lum = h => { const c = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const cr = (a, b) => { let x = lum(a), y = lum(b); if (x < y) [x, y] = [y, x]; return +((x + 0.05) / (y + 0.05)).toFixed(2); };
module.exports = { cr };
if (require.main === module) {
  const pairs = process.argv.slice(2);
  for (let i = 0; i < pairs.length; i += 2) console.log(`${pairs[i]} on ${pairs[i + 1]}: ${cr(pairs[i], pairs[i + 1])}`);
}
