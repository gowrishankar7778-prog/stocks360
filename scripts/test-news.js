const https = require('https');

function fetchNewsForSymbol(companyName) {
  return new Promise((resolve) => {
    const q = encodeURIComponent(companyName);
    const url = 'https://news.google.com/rss/search?q=' + q + '+when:30d&hl=en-IN&gl=IN&ceid=IN:en';
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      let xml = '';
      res.on('data', c => xml += c);
      res.on('end', () => {
        const items = [];
        const regex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<pubDate>(.*?)<\/pubDate>[\s\S]*?<source[^>]*>(.*?)<\/source>/g;
        let m;
        while ((m = regex.exec(xml)) !== null && items.length < 3) {
          items.push({
            headline: m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/- [^-]+$/, '').trim(),
            source: m[4] || 'Financial Express',
            date: new Date(m[3]).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
            category: 'Corporate News'
          });
        }
        resolve(items);
      });
    }).on('error', () => resolve([]));
  });
}

async function main() {
  const news = await fetchNewsForSymbol('Himadri Speciality Chemical');
  console.log('Real Live News for HSCL:');
  console.log(JSON.stringify(news, null, 2));
}

main();
