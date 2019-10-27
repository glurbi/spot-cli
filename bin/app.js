#!/usr/bin/env node

const request = require('request');
const yargs = require('yargs');
const open = require('open');
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
  .command('show [type]', 'show something')
  .command({
    command: '*',
    handler() {
      yargs.showHelp()
      process.exit()
    }
  })
  .help()
  .argv

run()

function run() {
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
}

function handleLogin() {
  const state = randomstring.generate()
  const redirectUri = 'http://localhost:3456/'
  const callbackListener = express()
  
  function requestToken() {
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
    const authorizationHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    request.post({
        url: 'https://accounts.spotify.com/api/token',
        headers: {
          'Authorization': `Basic ${authorizationHeader}`,
          'content-type' : 'application/x-www-form-urlencoded'
        },
        body: `grant_type=authorization_code&code=${code}&redirect_uri=${redirectUri}`
      },
      function(error, response, body) {
        token = JSON.parse(body).access_token
        keytar.setPassword("spot-cli", "token", token)
        console.log("logged in!")
        process.exit()
      })
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

function handleLogout() {
  keytar.deletePassword("spot-cli", "token")
  console.log("logged out!")
  process.exit()
}

function handleShow() {
  keytar
  .getPassword("spot-cli", "token")
  .then((token) => {
    if (token == null) {
      console.log("Not logged in!")
      process.exit()
    }
    switch (argv.type) {
      case 'me':
        showMe(token)
        break
      case 'playlists':
        showPlaylists(token)
        break
      default:
        console.log('what to show ?')
        process.exit()
        break
    }
  })
}

function showMe(token) {
  request.get({
      url: 'https://api.spotify.com/v1/me',
      headers: {
        'Authorization': `Bearer ${token}`,
      }
    },
    function(error, response, body) {
      const me = JSON.parse(body)
      console.log("name:" + me.display_name)
      console.log("id: " + me.id)
      console.log("email: " + me.email)
      process.exit()
    })
}

function showPlaylists(token) {
  request.get({
      url: 'https://api.spotify.com/v1/me/playlists',
      headers: {
        'Authorization': `Bearer ${token}`,
      }
    },
    function(error, response, body) {
      const playlists = JSON.parse(body)
      playlists.items.forEach((item, n) => console.log(`${n+1}. ${item.name} ${item.id}`))
      process.exit()
    })
}

