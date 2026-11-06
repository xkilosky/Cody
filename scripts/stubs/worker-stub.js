// Stand-in for Vite's `?worker` imports when running under node.
export default class StubWorker {
  constructor() {
    this.listeners = new Map()
  }
  addEventListener(type, handler) {
    const list = this.listeners.get(type) ?? []
    list.push(handler)
    this.listeners.set(type, list)
  }
  removeEventListener() {}
  postMessage() {}
  terminate() {}
}
