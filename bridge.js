// bridge.js (Socket.IO v4 + node-osc)
const http = require('http')
const { Server } = require('socket.io')
const osc = require('node-osc')

const IO_PORT = process.env.IO_PORT || 8081
const OSC_IN_PORT = process.env.OSC_IN_PORT || 8000

const httpServer = http.createServer()
const io = new Server(httpServer, { cors: { origin: '*' } })

httpServer.listen(IO_PORT, () => {
  console.log(`✅ Socket.IO listening on http://localhost:${IO_PORT}`)
})

let oscServer = new osc.Server(OSC_IN_PORT, '0.0.0.0', () => {
  console.log(`🎧 OSC UDP listening on 0.0.0.0:${OSC_IN_PORT}`)
})

// Reenvía TODO mensaje OSC a los clientes web
oscServer.on('message', (msg) => {
  // msg: [address, arg1, arg2, ...]
  io.emit('osc', { address: msg[0], args: msg.slice(1) })
})

io.on('connection', (socket) => {
  console.log('🔌 Web client connected:', socket.id)
  socket.on('disconnect', () =>
    console.log('❌ Web client disconnected:', socket.id)
  )
})
