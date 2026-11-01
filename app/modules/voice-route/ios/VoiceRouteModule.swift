import AVFoundation
import ExpoModulesCore

public class VoiceRouteModule: Module {
  private var player: AVPlayer?
  private var timeObserver: Any?
  private var endObserver: NSObjectProtocol?
  private var currentUri: String?
  private var generation = 0
  private var pending: Promise?

  public func definition() -> ModuleDefinition {
    Name("VoiceRoute")
    Events("status")

    AsyncFunction("play") { (uri: String, earpiece: Bool, position: Double, promise: Promise) in
      DispatchQueue.main.async {
        self.start(uri: uri, earpiece: earpiece, position: position, promise: promise)
      }
    }

    AsyncFunction("setEarpiece") { (earpiece: Bool, promise: Promise) in
      DispatchQueue.main.async {
        guard let uri = self.currentUri, let player = self.player, player.timeControlStatus == .playing else {
          try? self.configure(earpiece: earpiece)
          promise.resolve(nil)
          return
        }
        let seconds = player.currentTime().seconds
        self.start(uri: uri, earpiece: earpiece, position: seconds.isFinite ? seconds : 0, promise: promise)
      }
    }

    Function("pause") {
      DispatchQueue.main.async {
        self.player?.pause()
      }
    }

    Function("stop") {
      DispatchQueue.main.async {
        self.shutdown()
      }
    }

    OnDestroy {
      DispatchQueue.main.async {
        self.shutdown()
      }
    }
  }

  private func start(uri: String, earpiece: Bool, position: Double, promise: Promise) {
    pending?.resolve(nil)
    pending = promise
    generation += 1
    let ticket = generation
    clearPlayer()
    currentUri = uri
    do {
      try configure(earpiece: earpiece)
      guard let url = mediaUrl(uri) else {
        fail("Could not open that recording.")
        return
      }
      let item = AVPlayerItem(url: url)
      let next = AVPlayer(playerItem: item)
      next.volume = 1
      player = next
      endObserver = NotificationCenter.default.addObserver(
        forName: .AVPlayerItemDidPlayToEndTime,
        object: item,
        queue: .main
      ) { [weak self] _ in
        guard let self, ticket == self.generation else { return }
        self.emit(finished: true)
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
      }
      let interval = CMTime(seconds: 0.08, preferredTimescale: 1000)
      timeObserver = next.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] _ in
        guard let self, ticket == self.generation else { return }
        self.emit(finished: false)
      }
      let begin = {
        next.play()
        self.succeed()
      }
      if position > 0.05 {
        next.seek(to: CMTime(seconds: position, preferredTimescale: 1000), toleranceBefore: .zero, toleranceAfter: .zero) { _ in
          if ticket == self.generation { begin() }
        }
      } else {
        begin()
      }
    } catch {
      fail(error.localizedDescription)
    }
  }

  private func configure(earpiece: Bool) throws {
    let session = AVAudioSession.sharedInstance()
    if earpiece {
      try session.setCategory(.playAndRecord, mode: .default, options: [.allowBluetooth])
      try session.setActive(true)
      try session.overrideOutputAudioPort(.none)
    } else {
      try session.setCategory(.playback, mode: .default, options: [])
      try session.setActive(true)
    }
  }

  private func mediaUrl(_ uri: String) -> URL? {
    if uri.hasPrefix("http://") || uri.hasPrefix("https://") || uri.hasPrefix("file://") {
      return URL(string: uri)
    }
    return URL(fileURLWithPath: uri)
  }

  private func shutdown() {
    generation += 1
    pending?.resolve(nil)
    pending = nil
    clearPlayer()
    currentUri = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
  }

  private func clearPlayer() {
    if let timeObserver, let player {
      player.removeTimeObserver(timeObserver)
    }
    timeObserver = nil
    if let endObserver {
      NotificationCenter.default.removeObserver(endObserver)
    }
    endObserver = nil
    player?.pause()
    player = nil
  }

  private func succeed() {
    pending?.resolve(nil)
    pending = nil
  }

  private func fail(_ message: String) {
    pending?.reject("ERR_VOICE", message)
    pending = nil
  }

  private func emit(finished: Bool) {
    let seconds = player?.currentTime().seconds ?? 0
    let length = player?.currentItem?.duration.seconds ?? 0
    sendEvent("status", [
      "position": seconds.isFinite ? seconds : 0,
      "duration": length.isFinite ? length : 0,
      "playing": player?.timeControlStatus == .playing && !finished,
      "didFinish": finished
    ])
  }
}
