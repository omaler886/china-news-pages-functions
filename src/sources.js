export const SOURCES = {
  wsj: {
    id: 'wsj',
    name: '华尔街日报',
    type: 'rss',
    upstream: [
      'https://feeds.content.dowjones.io/public/rss/RSSWorldNews',
      'https://feeds.content.dowjones.io/public/rss/socialeconomyfeed',
      'https://feeds.content.dowjones.io/public/rss/RSSMarketsMain',
      'https://feeds.content.dowjones.io/public/rss/RSSWSJD',
      'https://feeds.content.dowjones.io/public/rss/socialpoliticsfeed'
    ],
    load: fetchWsjChinaNews
  },
  nytimes: {
    id: 'nytimes',
    name: '纽约时报',
    type: 'section-html',
    upstream: ['https://www.nytimes.com/topic/destination/china'],
    load: fetchNytChinaNews
  },
  bbc: {
    id: 'bbc',
    name: 'BBC',
    type: 'rss',
    upstream: ['https://feeds.bbci.co.uk/news/world/asia/china/rss.xml'],
    load: fetchBbcChinaNews
  },
  cnn: {
    id: 'cnn',
    name: 'CNN',
    type: 'section-html',
    upstream: ['https://edition.cnn.com/world/china'],
    load: fetchCnnChinaNews
  },
  scmp: {
    id: 'scmp',
    name: '南华早报',
    type: 'section-html',
    upstream: ['https://www.scmp.com/topics/china'],
    load: fetchScmpChinaNews
  },
  zaobao: {
    id: 'zaobao',
    name: '联合早报',
    type: 'section-html',
    upstream: ['https://www.zaobao.com/realtime/china'],
    load: fetchZaobaoChinaNews
  }
};

