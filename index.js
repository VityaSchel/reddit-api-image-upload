import fs from 'fs/promises'
import fetch from 'node-fetch'
import {FormData, Blob} from "formdata-node"
import {fileFromPath} from "formdata-node/file-from-path"
import path from 'path'
import _ from 'lodash'
import generateBasicAuth from 'basic-authorization-header'
import { XMLParser } from 'fast-xml-parser'

const TOKEN_NEEDS_TO_BE_OBTAINED = null

export default class RedditImageUploader {
  /**
   * Upload images to Reddit directly
   * @param {{clientID: string, clientSecret: string, username: string, password: string, userAgent: string}|{token: string, userAgent: string}} credentials Credentials for Reddit API
   */
  constructor(credentials) {
    const configurations = [
      ['clientID', 'clientSecret', 'username', 'password', 'userAgent'],
      ['token', 'userAgent']
    ]
    const credentialsProperties = Object.keys(credentials)
    switch (configurations.findIndex(configProperties => _.xor(configProperties, credentialsProperties).length === 0)) {
      case 0:
        // password grant
        this.token = TOKEN_NEEDS_TO_BE_OBTAINED
        break

      case 1:
        // use token directly
        this.token = credentials.token
        break

      default:
        throw `You must use exact configuration with no extra parameters, provide one of the following configurations for constructor: ${configurations.map(configProperties => configProperties.join(', ')).join('; ')}`
    }
    this.credentials = credentials
  }

  async uploadMedia(pathToFile) {
    if (this.token === TOKEN_NEEDS_TO_BE_OBTAINED) {
      this.token = await loginWithPassword(this.credentials)
    }
    return await uploadMediaFile(pathToFile, this.token, this.credentials.userAgent)
  }
}
// TODO: move everything to class body when private methods implemented in Node

async function loginWithPassword(credentials) {
  const body = new FormData()
  body.append('grant_type', 'password')
  body.append('username', credentials.username)
  body.append('password', credentials.password)

  const responseRaw = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    body,
    headers: {
      Authorization: generateBasicAuth(credentials.clientID, credentials.clientSecret),
      'User-Agent': credentials.userAgent
    }
  })
  const response = await responseRaw.json()
  try {
    const accessToken = response.access_token
    return accessToken
  } catch(e) {
    console.error('Reddit response:', response)
    throw e
  }
}

async function uploadMediaFile(mediafile, token, userAgent) {
  let file, mimetype, filename

  if (typeof mediafile === 'string') {
    file = await fileFromPath(mediafile)
    filename = path.basename(mediafile)
    mimetype = guessMimeType(filename)
  //} else if (file instanceof Buffer) {
    //mimetype = use mmmagic module?
    //filename = 'placeholder. what? extension based on guessed mimetype?
  } else {
    throw 'You must use string as path to the file to upload it to Reddit.'
  }

  const { uploadURL, fields, listenWSUrl } = await obtainUploadURL(filename, mimetype, token, userAgent)

  const imageURL = await uploadToAWS(uploadURL, fields, file, filename)
  return { imageURL, webSocketURL: listenWSUrl }
}

function guessMimeType(filename) {
  const extension = path.extname(filename)
  const mimeTypes = {
    '.png': 'image/png',
    '.mov': 'video/quicktime',
    '.mp4': 'video/mp4',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
  }
  return mimeTypes[extension] ?? mimeTypes.jpeg
}
  
async function obtainUploadURL(filename, mimetype, token, userAgent) {
  const bodyForm = new FormData()
  bodyForm.append('filepath', filename)
  bodyForm.append('mimetype', mimetype)

  const uploadURLResponseRaw = await fetch('https://oauth.reddit.com/api/media/asset.json', {
    method: 'POST',
    body: bodyForm,
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': userAgent
    }
  })

  const uploadURLResponse = await uploadURLResponseRaw.json()
  try {
    const uploadURL = `https:${uploadURLResponse.args.action}`
    const fields = uploadURLResponse.args.fields
    const listenWSUrl = uploadURLResponse.asset.websocket_url

    return { uploadURL, fields, listenWSUrl }
  } catch(e) {
    console.error('Reddit API response:', uploadURLResponse)
    throw e
  }
}

async function uploadToAWS(uploadURL, fields, buffer, filename) {
  const bodyForm = new FormData()
  fields.forEach(field => bodyForm.append(...Object.values(field)))
  bodyForm.append('file', buffer, filename)

  const responseRaw = await fetch(uploadURL, {
    method: 'POST',
    body: bodyForm
  })
  const response = await responseRaw.text()

  try {
    const parser = new XMLParser()
    const xml = parser.parse(response)
    const encodedURL = xml.PostResponse.Location
    if (!encodedURL) throw 'No URL returned'
    const imageURL = decodeURIComponent(encodedURL)
    return imageURL
  } catch(e) {
    console.error('CDN Response:', response)
    throw e
  }
}