package expo.modules.voiceroute

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class VoiceRouteModule : Module() {
  private val handler = Handler(Looper.getMainLooper())
  private var audioManager: AudioManager? = null
  private var player: MediaPlayer? = null
  private var focusRequest: AudioFocusRequest? = null
  private var pending: Promise? = null
  private var currentUri: String? = null
  private var generation = 0
  private var ticking = false

  private val tick = object : Runnable {
    override fun run() {
      val active = player
      if (!ticking || active == null || !active.isPlaying) return
      emit(false)
      handler.postDelayed(this, 80)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("VoiceRoute")
    Events("status")

    OnCreate {
      val context = appContext.reactContext
      audioManager = context?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    }

    OnDestroy {
      handler.post {
        generation += 1
        releasePlayer()
        abandonFocus()
        route(false)
      }
    }

    AsyncFunction("play") { uri: String, earpiece: Boolean, positionSeconds: Double, promise: Promise ->
      handler.post {
        start(uri, earpiece, (positionSeconds * 1000).toInt(), promise)
      }
    }

    AsyncFunction("setEarpiece") { earpiece: Boolean, promise: Promise ->
      handler.post {
        val active = player
        val uri = currentUri
        if (active == null || uri == null || !active.isPlaying) {
          route(earpiece)
          promise.resolve(null)
          return@post
        }
        start(uri, earpiece, active.currentPosition, promise)
      }
    }

    Function("pause") {
      handler.post {
        ticking = false
        handler.removeCallbacks(tick)
        player?.pause()
      }
    }

    Function("stop") {
      handler.post { shutdown() }
    }
  }

  private fun start(uri: String, earpiece: Boolean, positionMs: Int, promise: Promise) {
    pending?.resolve(null)
    pending = promise
    generation += 1
    val ticket = generation
    releasePlayer()
    currentUri = uri
    val context = appContext.reactContext
    if (context == null) {
      fail("The audio player is not ready.")
      return
    }
    var created: MediaPlayer? = null
    try {
      val manager = audioManager
      val throughEar = earpiece && (manager == null || !headsetConnected(manager))
      route(throughEar)
      val attributes = attributesFor(throughEar)
      requestFocus(attributes)
      val media = MediaPlayer()
      created = media
      media.setAudioAttributes(attributes)
      media.setVolume(1f, 1f)
      media.setDataSource(context, Uri.parse(uri))
      media.setOnCompletionListener {
        if (ticket != generation) return@setOnCompletionListener
        ticking = false
        handler.removeCallbacks(tick)
        emit(true)
        abandonFocus()
        route(false)
      }
      media.setOnErrorListener { _, what, extra ->
        if (ticket == generation) fail("Playback failed ($what/$extra).")
        true
      }
      media.setOnPreparedListener { prepared ->
        if (ticket != generation) {
          prepared.release()
          return@setOnPreparedListener
        }
        player = prepared
        if (positionMs > 0) prepared.seekTo(positionMs)
        prepared.start()
        ticking = true
        handler.post(tick)
        succeed()
      }
      media.prepareAsync()
    } catch (error: Exception) {
      created?.release()
      fail(error.message ?: "Could not play that recording.")
    }
  }

  private fun shutdown() {
    generation += 1
    pending?.resolve(null)
    pending = null
    releasePlayer()
    currentUri = null
    abandonFocus()
    route(false)
  }

  private fun releasePlayer() {
    ticking = false
    handler.removeCallbacks(tick)
    player?.setOnCompletionListener(null)
    player?.setOnErrorListener(null)
    player?.setOnPreparedListener(null)
    try {
      player?.stop()
    } catch (_: Exception) {
      // The player can already be idle.
    }
    player?.release()
    player = null
  }

  private fun succeed() {
    pending?.resolve(null)
    pending = null
  }

  private fun fail(message: String) {
    pending?.reject("ERR_VOICE", message, null)
    pending = null
  }

  private fun emit(finished: Boolean) {
    val active = player
    val durationMs = active?.duration ?: 0
    sendEvent(
      "status",
      mapOf(
        "position" to ((active?.currentPosition ?: 0) / 1000.0),
        "duration" to (if (durationMs > 0) durationMs / 1000.0 else 0.0),
        "playing" to (active?.isPlaying == true && !finished),
        "didFinish" to finished
      )
    )
  }

  private fun attributesFor(earpiece: Boolean): AudioAttributes {
    return if (earpiece) {
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()
    } else {
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
        .build()
    }
  }

  private fun requestFocus(attributes: AudioAttributes) {
    val manager = audioManager ?: return
    abandonFocus()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(attributes)
        .build()
      focusRequest = request
      manager.requestAudioFocus(request)
    } else {
      @Suppress("DEPRECATION")
      manager.requestAudioFocus(
        null,
        if (attributes.usage == AudioAttributes.USAGE_VOICE_COMMUNICATION) {
          AudioManager.STREAM_VOICE_CALL
        } else {
          AudioManager.STREAM_MUSIC
        },
        AudioManager.AUDIOFOCUS_GAIN_TRANSIENT
      )
    }
  }

  private fun abandonFocus() {
    val manager = audioManager ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focusRequest?.let { manager.abandonAudioFocusRequest(it) }
      focusRequest = null
    } else {
      @Suppress("DEPRECATION")
      manager.abandonAudioFocus(null)
    }
  }

  @Suppress("DEPRECATION")
  private fun route(earpiece: Boolean) {
    val manager = audioManager ?: return
    if (!earpiece || headsetConnected(manager)) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) manager.clearCommunicationDevice()
      manager.isSpeakerphoneOn = true
      manager.mode = AudioManager.MODE_NORMAL
      return
    }
    manager.mode = AudioManager.MODE_IN_COMMUNICATION
    manager.isSpeakerphoneOn = false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val device = manager.availableCommunicationDevices.firstOrNull {
        it.type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
      }
      if (device != null) manager.setCommunicationDevice(device)
    }
    val callMax = manager.getStreamMaxVolume(AudioManager.STREAM_VOICE_CALL)
    if (callMax > 0) {
      val mediaMax = manager.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
      val mediaNow = manager.getStreamVolume(AudioManager.STREAM_MUSIC)
      val matched = ((mediaNow.toFloat() / mediaMax) * callMax).toInt()
      val loud = (callMax * 0.9f).toInt()
      val target = maxOf(matched, if (mediaNow > 0) loud else 1).coerceIn(1, callMax)
      if (manager.getStreamVolume(AudioManager.STREAM_VOICE_CALL) < target) {
        manager.setStreamVolume(AudioManager.STREAM_VOICE_CALL, target, 0)
      }
    }
  }

  private fun headsetConnected(manager: AudioManager): Boolean {
    val outputs = manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
    return outputs.any {
      it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
        it.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
        it.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
        it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
        it.type == AudioDeviceInfo.TYPE_USB_HEADSET
    }
  }
}
