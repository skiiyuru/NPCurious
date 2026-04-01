import "dotenv/config.js" //auto-load env secrets
import { DjsConnect, DjsClientSocket } from "@unitn-asa/deliveroo-js-sdk"

const socket = DjsConnect()

/*
const moveUp = socket.emitMove("up")
moveUp.then((data) => {
  console.log(data)
})

// socket.emitPickup()
*/

// listen for any info about agent
// socket.onYou((agent) => {
//   console.log(agent)
// })

// socket.onSensing((data) => {
//   console.log(data.agents.length)
// })

// Review Tile configs slide-10

let myPos = { x: 0, y: 0 }

socket.onYou((id, name, x, y) => {
  myPos = { x, y }
})

socket.emitMove("up").then((data) => console.log(data))

// socket.onMap(async (width, height, tiles) => {
//   const directions = ["right", "right", "down", "left", "left"]

//   for (const direction of directions) {
//     const result = await socket.emitMove(direction)

//     if (!result) {
//       console.log(`❌: ${direction}, retrying...`)
//       await new Promise((resolveFn) => {
//         setTimeout(resolveFn, 100)
//       })

//       const result = await socket.emitMove(direction)
//     }
//   }
// })
