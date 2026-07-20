// Augment Bun's WebSocket with the id property
declare global {
  // biome-ignore lint/style/noNamespace: global namespace augmentation is required for Bun types
  namespace Bun {
    interface WebSocket {
      readonly id: string;
    }
  }
}

// Augment WebSocketPair as a global constructor
declare global {
  var WebSocketPair: () => { client: Bun.WebSocket; server: Bun.WebSocket };
}

// Augment ResponseInit to support Bun's webSocket option
declare global {
  interface ResponseInit {
    webSocket?: Bun.WebSocket;
  }
}

export {};
