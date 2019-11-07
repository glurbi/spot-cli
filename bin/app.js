#!/usr/bin/env node

const rp = require('request-promise')
const yargs = require('yargs')
const open = require('open')
const express = require('express')
const randomstring = require("randomstring")
const keytar = require('keytar')

const clientId = process.env.SPOTIFY_CLIENT_ID

var code = undefined

let argv = yargs
  .scriptName("spot-cli")
  .usage('$0 <cmd> [args]')
  .command('login', 'request token to spotify')
  .command('logout', 'clear any token stored locally')
  .command('show <what> [index|id]', 'show details for a resource (see examples)')
  .example('$0 show playlists', 'list all available playlists for the current account')
  .example('$0 show playlist 12', 'list all the tracks for playlist number 12')
  .example('$0 show me', 'show the details about the current account')
  .example('$0 show summary', 'show some numbers...')
  .command({
    command: '*',
    handler() {
      yargs.showHelp()
      process.exit()
    }
  })
  .help()
  .argv

switch (argv._[0]) {
  case 'login':
    handleLogin()
    break
  case 'logout':
    handleLogout()
    break
  case 'show':
    handleShow()
    break
  default:
    yargs.showHelp()
    break
}

function handleLogin() {
  const state = randomstring.generate()
  const redirectUri = 'http://localhost:3456/'
  const callbackListener = express()
  
  async function requestToken() {
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
    const authorizationHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const options = {
      method: 'POST',
      uri: 'https://accounts.spotify.com/api/token',
      headers: {
        'Authorization': `Basic ${authorizationHeader}`,
        'content-type' : 'application/x-www-form-urlencoded'
      },
      body: `grant_type=authorization_code&code=${code}&redirect_uri=${redirectUri}`,
      json: true
    }
    const body = await rp(options)
    token = body.access_token
    await keytar.setPassword("spot-cli", "token", token)
    console.log("logged in!")
    process.exit()
  }

  function handleRedirect(req, res) {
    if (state !== req.query.state) {
      console.log("Hacked...")
      process.exit()
    }
    if (req.query.code) {
      res.send('authorized')
      code = req.query.code
      requestToken();
    } else {
      res.send(req.query.error)
    }
  }

  callbackListener.get('/', handleRedirect)
  callbackListener.listen(3456)

  const baseUrl = 'https://accounts.spotify.com/authorize'
  const scope = 'user-read-private%20user-read-email'
  const url =
    `${baseUrl}?client_id=${clientId}&response_type=code&state=${state}` +
    `&redirect_uri=${redirectUri}&scope=${scope}&show_dialog=true`
  open(url)
}

async function handleLogout() {
  await keytar.deletePassword("spot-cli", "token")
  console.log("logged out!")
  process.exit()
}

async function handleShow() {
  const token = await keytar.getPassword("spot-cli", "token")
  if (token == null) {
    console.log("Not logged in!")
    process.exit()
  }
  if (argv.what === 'me') showMe(token)
  else if (argv.what === 'playlists') showPlaylists(token)
  else if (argv.what === 'playlist') showPlaylist(token, argv.id)
  else if (argv.what === 'summary') showSummary(token)
  else console.log('what to show ?')
}

async function showMe(token) {
  const options = {
    uri: 'https://api.spotify.com/v1/me',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    json: true
  }
  const body = await rp(options)
  console.log("name:" + body.display_name)
  console.log("id: " + body.id)
  console.log("email: " + body.email)
  process.exit()
}

async function fetchPlaylists(token) {
  const options = {
    uri: 'https://api.spotify.com/v1/me/playlists',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    json: true
  }
  const body = await rp(options)
  return body.items
}

async function showPlaylists(token) {
  const items = await fetchPlaylists(token)
  items.forEach(
    (item, n) => console.log(`${n+1}. ${item.name} ${item.id}`)
  )
  process.exit()
}

async function fetchPlaylist(token, id) {

    // create options for querying a playlist
    function options(limit, offset) {
      return {
        uri: `https://api.spotify.com/v1/playlists/${id}/tracks`,
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        qs: {
          limit: limit,
          offset: offset
        },
        json: true
      }
    }
  
    // collect all requests
    var promises = []
    const body = await rp(options(100,0))
    var offset = 0
    while (offset < body.total) {
      promises.push(rp(options(body.limit,offset)))
      offset += body.limit
    }
  
    // execute requests
    const responses = await Promise.all(promises)
    return responses.flatMap(x => x.items)
}

async function showPlaylist(token, id) {
  const items = await fetchPlaylist(token, id)
  items.forEach(
    (item, n) => console.log(`${n+1}. ${item.track.name} ${item.track.id}`)
  )
  process.exit()
}

async function showSummary(token) {
  const playlists = await fetchPlaylists(token)
  console.log(`${playlists.length} playlists`)
  var tracks = []
  for (var i = 0; i < playlists.length; i++) {
    const id = playlists[i].id 
    const items = await fetchPlaylist(token, id)
    items.forEach((item, n) => tracks.push(item.track))
    process.stdout.write(".")
  }
  console.log("")
  console.log(`${tracks.length} tracks`)
  process.exit()
}
