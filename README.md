# reddit-api-image-upload

NodeJS module for uploading images directly to Reddit server and then use it with any "full-featured beta wrapper" to submit post.

Proudly stolen from [PRAW](https://github.com/praw-dev/praw/blob/c3da0523d9937f57a69dedac44da231e0302472c/praw/models/reddit/subreddit.py#L642) because every python library deserves better implementation in js.

## Install

```
npm i reddit-api-image-upload
```

## Usage

Import and use default export as class, create instance and pass object containing properties listed below, then use uploadMedia function in created instance, which accepts one parameter: *string* containing path to the file and returns Promise which resolves to object containing URL of image and websocket. It can also throw error. Buffer is not supported for now, because lib will not be able to detect filename and mimetype. But you can edit request.js file and use buffers.

Instance constructor needs one of two following configurations:

1. First is easier and uses password, parameters are the same as in PRAW, you'll need to [create script app on Reddit](https://www.reddit.com/prefs/apps) but I'm sure you already did, because this library is intended to be used with wrapper.
```javascript
{
  clientID: 'CLIENT_ID',
  clientSecret: 'CLIENT_SECRET',
  username: 'USERNAME',
  password: 'PASSWORD',
  userAgent: 'USERAGENT'
}
```

2. Second uses OAuth manual grant tokens, you'll have to follow [this guide](https://github.com/reddit-archive/reddit/wiki/OAuth2) in order to get them. You can also use this configuration to pass already created password-token or any other bearer token that is compatible with `https://oauth.reddit.com/api/media/asset.json` endpoint.
```javascript
{
  token: 'ANY TOKEN',
  userAgent: 'USERAGENT'
}
```

`userAgent` is needed anyways, you can use this template: `bot:[client id]:v1.0.0 (by /u/[your username]) Uploading image to submit it later`

`uploadMedia` function signature: `uploadMedia(file: string): Promise<{imageURL: string, webSocketURL: string}>`

You can call `uploadMedia` as longer as token is valid, there is no need to create new instances. If you use 1st configuration, it is much faster to use existing instance instead of creating new ones because token will need to be obtained at first call of uploadMedia, recreate instance each 3600 seconds. There is no performance boost when reusing instance for 2nd configuration though.

Average `uploadMedia` execution time is 950ms

## Example

```javascript
import RedditImageUploader from 'reddit-api-image-upload'

const redditImageUploader = new RedditImageUploader({
  clientID: 'CLIENT_ID',
  clientSecret: 'CLIENT_SECRET',
  username: 'USERNAME',
  password: 'PASSWORD',
  userAgent: 'bot:[client id]:v1.0.0 (by /u/[your username]) Uploading image to submit it later'
})

const { imageURL, webSocketURL } = await redditImageUploader.uploadMedia('~/Desktop/sus.jpeg')

console.log('Submit this url as link post to any subreddit:', imageURL)
console.log('Connect to this websocket to get notified when post with image is submitted:', webSocketURL)
```

## How it works

u hate js? use this guide to rewrite this lib on any language:

For now I only found two ways of uploading: with OAuth grant and with password. I really really really really hope reddit won't remove password grant support as every other website do, because with OAuth you'll have to complete a long [step-by-step algorythm](https://github.com/reddit-archive/reddit/wiki/OAuth2) in order to get bearer access token. I'll leave it outside of this text and focus on password grant, used by PRAW, but you can use OAuth token too with 2nd configuration.

1. Get access token with either `grant_type`=`password` or `grant_type`=`authorization_code`. Every other grant type, including `client_credentials` is not compatible with image uploading
2. Make POST http request to `https://oauth.reddit.com/api/media/asset.json` with bearer token in Authorization header and these fields in body:
  - `filepath`=\[file name with extension (basename)\]
  - `mimetype`=\[file mime type\]
  
  PRAW tries to guess mime type depending on extension:
  ```python
    mime_type = {
        "png": "image/png",
        "mov": "video/quicktime",
        "mp4": "video/mp4",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "gif": "image/gif",
    }.get(
        file_extension, "image/jpeg"
    )  # default to JPEG
  ```
  
  so does this lib

3. In response, you will either get 403 Forbidden error which means you have troubles with token or kind of this:
```json
{
    "args": {
        "action": "//reddit-uploaded-media.s3-accelerate.amazonaws.com",
        "fields": [
            {
                "name": "x-amz-security-token",
                "value": "AGHSjghasdhjkasjkh//////////sahuidhkuashjkdjkhasjhkd/ASHghahgjsdhjsahjdhahshdjahkjshdjk/AHjhjkashjkdasdasdasd+asdhkasdjkhsahjkd+EpQlH+asjkdjhasdhjk/ashdhasjdhjashjdasd+ashdhjahajshjdkaasdhasdhggahsghjdaghjshjgdahjshjdashj+asdhhajkdhjks="
            },
            //...other properties, I have 12 fields in total, but you may have other number if API changes
        ]
    },
    "asset": {
        "asset_id": "djhkasfjkds",
        "processing_state": "incomplete",
        "payload": {
            "filepath": "hello.jpeg"
        },
        "websocket_url": "wss://ws-ashdgaghsj.wss.redditmedia.com/rte_images/gh123ghj12ghj?m=AAGkaghksdgqkygewqgehkbqbwkekhjwehkurhkjwer"
    }
}
```
4. Grab Upload URL (args.action), fields (args.fields) and listening url (asset.websocket_url)
  - Upload URL is self-explanatory
  - Fields is array you'll have to pass in next request's **MULTIPART FORM BODY** not headers!!!!
  - Listening URL is websocket url you can listen, it will ignore any of your messages and will send you `{"type": "success", "payload": {"redirect": "https://www.reddit.com/r/test/comments/abcde1/aboba/"}}` message when you submit uploaded image. I dunno about other messages, but it does not tell you when upload done and it does not disconnect you automatically after you submit post so make sure to disconnect manually!!!
5. Upload image to CDN. Use Upload URL with `https:` prefix and fetch it with POST method, include every field you collected from response of previous request, put them all into multipart/form-data and make request. Do not add any headers beyond default! All headers you need are `Content-Type`, `Content-Length` and maybe some technical ones such as Host and Accept, no signatures, authorization, content-sha256 and other headers you may want to add according to AWS docs. Add file to form body with `file` key.
6. From AWS you'll get XML response, something like this:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<PostResponse><Location>https://reddit-uploaded-media.s3-accelerate.amazonaws.com/rte_images%2F8tmc5o7iojo81</Location><Bucket>reddit-uploaded-media</Bucket><Key>rte_images/8tmc5o7iojo81</Key><ETag>"2c33c7472b5fe16b3e291999073722d5"</ETag></PostResponse>
```

Which indicates success. Or,

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Error><Code>AccessDenied</Code><Message>Invalid according to Policy: Policy expired.</Message><RequestId>XRDNGGFXZSDJSHEX</RequestId><HostId>bExw/1olpBj6us55bISqCrqbZLl3k62GUnb0uPoMSpNqjPT2CEEoTX6qVdjXkB4LVqJqwTEfzKs=</HostId></Error>
```

which indicates failure because there was too much time between 4 and 5 step, you won't get this in production, I tested it and it have timeout more than 5 seconds so you don't need to handle it, just know that policy can expire when debugging.
1. Grab `Location` value and url-decode it. You will have kind of this url: `https://reddit-uploaded-media.s3-accelerate.amazonaws.com/rte_images/8tmc5o7iojo81` BUT you won't be able to see the image itself in browser, you have to submit it.
2. Finally, submit the image. You need to use link-type post and pass URL you got in previous step from CDN to reddit. After that, you need to listen for websocket connection at url you got in 4 step and wait until you get redirect link, which will be your final link to post with uploaded image.

I don't know about any limitations but you defenetaly want to set-up User-Agent header every time you make request to Reddit API (not CDN). It is not critical for debugging, but you need to set it up before going in production.

## License

[MIT](https://github.com/VityaSchel/reddit-api-image-upload/LICENSE)