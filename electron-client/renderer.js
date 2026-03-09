// electron-client/renderer.js

(() => {
  const peers = {};
  let ws;
  let myId;
  let localStream; // make it module-scoped

  const videoContainer = document.getElementById("videos");
  const log = document.getElementById("log");

  function logMsg(m) {
    log.textContent += m + "\n";
  }

  function addRemoteVideo(peerId, stream) {
    let vid = document.getElementById(`video-${peerId}`);
    if (!vid) {
      vid = document.createElement("video");
      vid.id = `video-${peerId}`;
      vid.autoplay = true;
      vid.playsInline = true;
      vid.width = 200;
      vid.height = 150;
      videoContainer.appendChild(vid);
    }
    vid.srcObject = stream;
  }

  function removeRemoteVideo(peerId) {
    const vid = document.getElementById(`video-${peerId}`);
    if (vid) {
      vid.srcObject = null;
      videoContainer.removeChild(vid);
    }
  }

  async function createConnection(peerId) {
    if (!localStream) return; // safety
    if (peers[peerId]) return;

    const pc = new RTCPeerConnection();

    // add local tracks
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      addRemoteVideo(peerId, stream);
      logMsg(`Received remote stream from ${peerId}`);
    };

    pc.onicecandidate = e => {
      if (e.candidate) {
        ws.send(JSON.stringify({
          type: "signal",
          to: peerId,
          from: myId,
          data: { candidate: e.candidate }
        }));
      }
    };

    peers[peerId] = { pc };
    logMsg(`Created connection with ${peerId}`);

    // Offer policy: smaller ID initiates
    if (myId < peerId) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ws.send(JSON.stringify({
        type: "signal",
        to: peerId,
        from: myId,
        data: { sdp: pc.localDescription }
      }));
    }
  }

  async function handleSignal(msg) {
    if (!localStream) return;
    const { from, data } = msg;

    if (!peers[from]) {
      await createConnection(from);
    }

    const pc = peers[from].pc;

    if (data.sdp) {
      if (data.sdp.type === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({
          type: "signal",
          to: from,
          from: myId,
          data: { sdp: pc.localDescription }
        }));
      } else if (data.sdp.type === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      }
    }

    if (data.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        console.warn(`Failed to add ICE candidate from ${from}:`, e);
      }
    }
  }

  // Wait for config from main process
  window.electronAPI.onConfig(async ({ signalHost, id }) => {
    myId = id;
    logMsg(`Node ID: ${id}`);

    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

      // Show local video
      const localVid = document.createElement("video");
      localVid.autoplay = true;
      localVid.muted = true;
      localVid.playsInline = true;
      localVid.width = 200;
      localVid.height = 150;
      localVid.srcObject = localStream;
      videoContainer.appendChild(localVid);
    } catch (e) {
      logMsg("Error accessing camera/mic: " + e);
      return;
    }

    ws = new WebSocket(`ws://${signalHost}:8080`);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join", id }));
    };

    ws.onmessage = async (ev) => {
      const msg = JSON.parse(ev.data);

      switch (msg.type) {
        case "peers":
          for (const p of msg.peers) {
            await createConnection(p);
          }
          break;

        case "peer-joined":
          await createConnection(msg.id);
          break;

        case "peer-left":
          if (peers[msg.id]) {
            peers[msg.id].pc.close();
            delete peers[msg.id];
            removeRemoteVideo(msg.id);
            logMsg(`Peer left: ${msg.id}`);
          }
          break;

        case "signal":
          await handleSignal(msg);
          break;

        default:
          console.warn("Unknown message type:", msg.type);
      }
    };

    ws.onclose = () => logMsg("Disconnected from signaling server");
    ws.onerror = e => console.error("WebSocket error:", e);
  });
})();
