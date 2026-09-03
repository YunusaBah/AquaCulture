import 'dotenv/config';

const config = {
  datasources: {
    db: {
      provider: 'postgresql',
      url: process.env.DATABASE_URL,
    },
  },
};

export default config;
