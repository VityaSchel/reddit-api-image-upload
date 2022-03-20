import 'dotenv/config'
import RedditImageUploader from './index.js'

const redditImageUploader = new RedditImageUploader({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  username: process.env.USERNAME,
  password: process.env.PASSWORD,
  userAgent: 'script:-pTfnFkMCkp-9Q:v1.0.0 (by /u/Vitya_Schel)',
})

console.time('Upload image')
const { imageURL, webSocketURL } = await redditImageUploader.uploadMedia('/Users/VITA/Downloads/autodraw 20.03.2022.png')
console.timeEnd('Upload image')
console.log('Submit this url as link post to any subreddit:', imageURL, webSocketURL)