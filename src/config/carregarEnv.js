import dotenv from 'dotenv';
dotenv.config({
  path: process.env.ZOOLY_AMBIENTE?.trim() === 'demo' ? '.env.demo' : '.env'
});
