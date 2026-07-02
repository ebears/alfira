export default {
  server: {
    host: '0.0.0.0',
    port: 2333,
    password: 'nodelink-internal',
    useBunServer: true,
  },
  cluster: {
    enabled: true,
    workers: 1,
    minWorkers: 1,
    runtime: {
      workerMaxOldSpaceMb: 0,
      workerExposeGc: false,
      workerExecArgv: [],
      sourceWorkerMaxOldSpaceMb: 0,
      sourceWorkerExposeGc: false,
      sourceWorkerExecArgv: [],
    },
    specializedSourceWorker: {
      enabled: true,
      count: 1,
      microWorkers: 2,
      tasksPerWorker: 32,
      silentLogs: true,
    },
    commandTimeout: 6000,
    fastCommandTimeout: 4000,
    maxRetries: 2,
    hibernation: {
      enabled: true,
      timeoutMs: 1200000,
    },
    scaling: {
      maxPlayersPerWorker: 20,
      targetUtilization: 0.7,
      scaleUpThreshold: 0.75,
      scaleDownThreshold: 0.3,
      checkIntervalMs: 5000,
      idleWorkerTimeoutMs: 60000,
      queueLengthScaleUpFactor: 5,
      lagPenaltyLimit: 60,
      cpuPenaltyLimit: 0.85,
    },
    endpoint: {
      patchEnabled: true,
      allowExternalPatch: false,
      code: 'CAPYBARA',
    },
  },
  logging: {
    level: 'info',
    file: {
      enabled: false,
      path: 'logs',
      rotation: 'daily',
      ttlDays: 7,
    },
    debug: {
      all: false,
      request: false,
      session: false,
      player: false,
      filters: false,
      sources: false,
      lyrics: false,
      youtube: false,
      'youtube-cipher': false,
      sabr: false,
      potoken: false,
    },
  },
  connection: {
    logAllChecks: false,
    interval: 300000,
    timeout: 10000,
    thresholds: {
      bad: 1,
      average: 5,
    },
  },
  maxSearchResults: 10,
  maxAlbumPlaylistLength: 100,
  playerUpdateInterval: 2000,
  statsUpdateInterval: 30000,
  trackStuckThresholdMs: 10000,
  eventTimeoutMs: 15000,
  zombieThresholdMs: 60000,
  enableHoloTracks: false,
  enableTrackStreamEndpoint: false,
  enableLoadStreamEndpoint: false,
  resolveExternalLinks: false,
  fetchChannelInfo: false,
  filters: {
    enabled: {
      tremolo: true,
      vibrato: true,
      lowpass: true,
      highpass: true,
      rotation: true,
      karaoke: true,
      distortion: true,
      channelMix: true,
      equalizer: true,
      chorus: true,
      compressor: true,
      echo: true,
      phaser: true,
      timescale: true,
    },
  },
  defaultSearchSource: ['youtube'],
  unifiedSearchSources: ['youtube'],
  sources: {
    youtube: {
      enabled: true,
      allowItag: [],
      targetItag: null,
      getOAuthToken: false,
      hl: 'en',
      gl: 'US',
      clients: {
        search: ['Android'],
        playback: ['AndroidVR', 'TV', 'TVCast', 'WebEmbedded', 'WebParentTools', 'Web', 'IOS'],
        resolve: ['AndroidVR', 'TV', 'TVCast', 'WebEmbedded', 'WebParentTools', 'IOS', 'Web'],
        settings: {
          TV: {
            refreshToken: [''],
          },
        },
      },
      cipher: {
        url: 'https://cipher.kikkia.dev/api',
        token: null,
      },
    },
    soundcloud: {
      enabled: true,
    },
    spotify: {
      enabled: false,
    },
    applemusic: {
      enabled: false,
    },
    deezer: {
      enabled: false,
    },
    bandcamp: {
      enabled: false,
    },
    local: {
      enabled: false,
    },
    http: {
      enabled: false,
    },
    vkmusic: {
      enabled: false,
    },
    amazonmusic: {
      enabled: false,
    },
    bluesky: {
      enabled: false,
    },
    anghami: {
      enabled: false,
    },
    rss: {
      enabled: false,
    },
    songlink: {
      enabled: false,
    },
    mixcloud: {
      enabled: false,
    },
    audiomack: {
      enabled: false,
    },
    eternalbox: {
      enabled: false,
    },
    vimeo: {
      enabled: false,
    },
    iheartradio: {
      enabled: false,
    },
    telegram: {
      enabled: false,
    },
    shazam: {
      enabled: false,
    },
    bilibili: {
      enabled: false,
    },
    genius: {
      enabled: false,
    },
    pinterest: {
      enabled: false,
    },
    flowery: {
      enabled: false,
    },
    lazypytts: {
      enabled: false,
    },
    jiosaavn: {
      enabled: false,
    },
    gaana: {
      enabled: false,
    },
    'google-tts': {
      enabled: false,
    },
    pipertts: {
      enabled: false,
    },
    instagram: {
      enabled: false,
    },
    kwai: {
      enabled: false,
    },
    twitch: {
      enabled: false,
    },
    tidal: {
      enabled: false,
    },
    pandora: {
      enabled: false,
    },
    nicovideo: {
      enabled: false,
    },
    reddit: {
      enabled: false,
    },
    tumblr: {
      enabled: false,
    },
    twitter: {
      enabled: false,
    },
    qobuz: {
      enabled: false,
    },
    lastfm: {
      enabled: false,
    },
    netease: {
      enabled: false,
    },
    letrasmus: {
      enabled: false,
    },
    yandexmusic: {
      enabled: false,
    },
    monochrome: {
      enabled: false,
    },
  },
  lyrics: {
    fallbackSource: 'genius',
    youtube: {
      enabled: true,
    },
    genius: {
      enabled: true,
    },
    musixmatch: {
      enabled: true,
    },
    deezer: {
      enabled: true,
    },
    lrclib: {
      enabled: true,
    },
    letrasmus: {
      enabled: true,
    },
    bilibili: {
      enabled: true,
    },
    yandexmusic: {
      enabled: true,
    },
    monochrome: {
      enabled: true,
    },
  },
  meanings: {
    letrasmus: {
      enabled: true,
    },
    wikipedia: {
      enabled: true,
    },
  },
  audio: {
    quality: 'high',
    encryption: 'aead_aes256_gcm_rtpsize',
    resamplingQuality: 'best',
    loudnessNormalizer: false,
    lookaheadMs: 5,
    gateThresholdLUFS: -60,
  },
  voiceReceive: {
    enabled: false,
    format: 'opus',
  },
  routePlanner: {
    strategy: 'RotateOnBan',
    bannedIpCooldown: 600000,
    ipBlocks: [],
  },
  rateLimit: {
    enabled: true,
    global: {
      maxRequests: 1000,
      timeWindowMs: 60000,
    },
    perIp: {
      maxRequests: 100,
      timeWindowMs: 10000,
    },
    perUserId: {
      maxRequests: 50,
      timeWindowMs: 5000,
    },
    perGuildId: {
      maxRequests: 20,
      timeWindowMs: 5000,
    },
    ignorePaths: [],
    ignore: {
      userIds: [],
      guildIds: [],
      ips: [],
    },
  },
  dosProtection: {
    enabled: true,
    thresholds: {
      burstRequests: 50,
      timeWindowMs: 10000,
    },
    mitigation: {
      delayMs: 500,
      blockDurationMs: 300000,
    },
    ignore: {
      userIds: [],
      guildIds: [],
      ips: [],
    },
  },
  metrics: {
    enabled: true,
    authorization: {
      type: 'Bearer',
      username: 'admin',
      password: '',
    },
  },
  mix: {
    enabled: true,
    defaultVolume: 0.8,
    maxLayersMix: 5,
    autoCleanup: true,
  },
  plugins: [],
  pluginConfig: {},
};
