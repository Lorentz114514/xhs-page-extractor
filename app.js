// 小红书翻页视频扒图助手 - PC + 手机 PWA + 安卓原生 APK 全端核心逻辑
(() => {
  const dropZone = document.getElementById("dropZone");
  const dropAreaTrigger = document.getElementById("dropAreaTrigger");
  const fileInput = document.getElementById("fileInput");
  const xhsUrlInput = document.getElementById("xhsUrlInput");
  const xhsCookieInput = document.getElementById("xhsCookieInput");
  const btnPasteClipboard = document.getElementById("btnPasteClipboard");
  const btnParseUrl = document.getElementById("btnParseUrl");
  const urlStatusMsg = document.getElementById("urlStatusMsg");
  const envBadge = document.getElementById("envBadge");

  const videoPlayer = document.getElementById("videoPlayer");
  const videoEmptyPlaceholder = document.getElementById("videoEmptyPlaceholder");
  const currentVideoTitle = document.getElementById("currentVideoTitle");
  const videoMetaBadge = document.getElementById("videoMetaBadge");
  const currentTimeLabel = document.getElementById("currentTimeLabel");
  const cropOverlayTop = document.getElementById("cropOverlayTop");
  const cropOverlayBottom = document.getElementById("cropOverlayBottom");

  const btnStepBack = document.getElementById("btnStepBack");
  const btnStepForward = document.getElementById("btnStepForward");
  const btnManualCapture = document.getElementById("btnManualCapture");
  const btnLoadDemo = document.getElementById("btnLoadDemo");
  const btnOpenExports = document.getElementById("btnOpenExports");
  const btnInstallPwa = document.getElementById("btnInstallPwa");
  const btnMobileModal = document.getElementById("btnMobileModal");

  const mobileGuideModal = document.getElementById("mobileGuideModal");
  const mobileGuideBackdrop = document.getElementById("mobileGuideBackdrop");
  const btnCloseMobileModal = document.getElementById("btnCloseMobileModal");
  const lanQrCanvas = document.getElementById("lanQrCanvas");
  const lanUrlLink = document.getElementById("lanUrlLink");
  const btnDirectDownloadApk = document.getElementById("btnDirectDownloadApk");

  const presetSelect = document.getElementById("presetSelect");
  const modeSelect = document.getElementById("modeSelect");
  const rngSampleStep = document.getElementById("rngSampleStep");
  const rngMotionThresh = document.getElementById("rngMotionThresh");
  const rngMinHold = document.getElementById("rngMinHold");
  const rngDedup = document.getElementById("rngDedup");
  const rngFixedInterval = document.getElementById("rngFixedInterval");
  const rngCropTop = document.getElementById("rngCropTop");
  const rngCropBottom = document.getElementById("rngCropBottom");

  const valSampleStep = document.getElementById("valSampleStep");
  const valMotionThresh = document.getElementById("valMotionThresh");
  const valMinHold = document.getElementById("valMinHold");
  const valDedup = document.getElementById("valDedup");
  const valFixedInterval = document.getElementById("valFixedInterval");
  const valCropTop = document.getElementById("valCropTop");
  const valCropBottom = document.getElementById("valCropBottom");

  const paramSampleStepBox = document.getElementById("paramSampleStepBox");
  const paramMotionThreshBox = document.getElementById("paramMotionThreshBox");
  const paramMinHoldBox = document.getElementById("paramMinHoldBox");
  const paramDedupBox = document.getElementById("paramDedupBox");
  const paramFixedIntervalBox = document.getElementById("paramFixedIntervalBox");

  const btnStartExtract = document.getElementById("btnStartExtract");
  const btnStopExtract = document.getElementById("btnStopExtract");
  const progressContainer = document.getElementById("progressContainer");
  const progressText = document.getElementById("progressText");
  const progressPercent = document.getElementById("progressPercent");
  const progressBarFill = document.getElementById("progressBarFill");
  const motionChartCanvas = document.getElementById("motionChartCanvas");

  const pagesGrid = document.getElementById("pagesGrid");
  const galleryStatsBadge = document.getElementById("galleryStatsBadge");
  const mobileGalleryBadge = document.getElementById("mobileGalleryBadge");
  const btnSelectAll = document.getElementById("btnSelectAll");
  const btnInvertSelect = document.getElementById("btnInvertSelect");
  const btnClearAll = document.getElementById("btnClearAll");
  const exportNameInput = document.getElementById("exportNameInput");
  const exportFormatSelect = document.getElementById("exportFormatSelect");
  const btnSaveMobileGallery = document.getElementById("btnSaveMobileGallery");
  const btnSaveToFolder = document.getElementById("btnSaveToFolder");
  const btnDownloadZip = document.getElementById("btnDownloadZip");
  const exportResultBanner = document.getElementById("exportResultBanner");

  const lightboxModal = document.getElementById("lightboxModal");
  const lightboxBackdrop = document.getElementById("lightboxBackdrop");
  const lightboxTitle = document.getElementById("lightboxTitle");
  const lightboxImg = document.getElementById("lightboxImg");
  const btnLightboxPrev = document.getElementById("btnLightboxPrev");
  const btnLightboxNext = document.getElementById("btnLightboxNext");
  const btnLightboxClose = document.getElementById("btnLightboxClose");

  const navTabs = document.querySelectorAll(".nav-tab");
  const tabPanes = document.querySelectorAll(".mobile-tab-pane");

  let extractedPages = [];
  let motionSamples = [];
  let isExtracting = false;
  let stopRequested = false;
  let currentLightboxIndex = -1;
  let pageIdCounter = 1;
  let deferredPwaPrompt = null;

  const isAndroidNativeApp = typeof window.AndroidBridge !== "undefined";
  if (isAndroidNativeApp && envBadge) {
    envBadge.textContent = "🤖 安卓原生 App";
  }

  // ==================== PWA Service Worker & 安装提示 ====================
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferredPwaPrompt = e;
    if (btnInstallPwa) btnInstallPwa.classList.remove("hidden");
  });

  if (btnInstallPwa) {
    btnInstallPwa.addEventListener("click", async () => {
      if (!deferredPwaPrompt) return;
      deferredPwaPrompt.prompt();
      await deferredPwaPrompt.userChoice;
      deferredPwaPrompt = null;
      btnInstallPwa.classList.add("hidden");
    });
  }

  // ==================== 手机端底部 Tab 切换 ====================
  function switchMobileTab(targetName) {
    navTabs.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.target === targetName);
    });
    tabPanes.forEach(pane => {
      pane.classList.toggle("active", pane.dataset.tabPane === targetName);
    });
    if (targetName === "workspace") {
      setTimeout(() => drawMotionChart(), 50);
    }
  }

  navTabs.forEach(btn => {
    btn.addEventListener("click", () => switchMobileTab(btn.dataset.target));
  });

  // 恢复本地保存的 Cookie
  const savedCookie = localStorage.getItem("xhs_extractor_cookie") || "";
  if (savedCookie) {
    xhsCookieInput.value = savedCookie;
  }
  xhsCookieInput.addEventListener("change", () => {
    localStorage.setItem("xhs_extractor_cookie", xhsCookieInput.value.trim());
  });

  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${String(mins).padStart(2, "0")}:${secs.toFixed(2).padStart(5, "0")}`;
  }

  function showStatus(text, type = "info") {
    urlStatusMsg.textContent = text;
    urlStatusMsg.className = `status-msg ${type}`;
    urlStatusMsg.classList.remove("hidden");
  }

  // ==================== 一键粘贴剪贴板 ====================
  if (btnPasteClipboard) {
    btnPasteClipboard.addEventListener("click", async () => {
      try {
        let clipText = "";
        if (isAndroidNativeApp && window.AndroidBridge.getClipboardText) {
          clipText = window.AndroidBridge.getClipboardText();
        } else if (navigator.clipboard && navigator.clipboard.readText) {
          clipText = await navigator.clipboard.readText();
        }
        if (clipText) {
          xhsUrlInput.value = clipText.trim();
          showStatus("已粘贴剪贴板内容，正在自动解析...", "info");
          btnParseUrl.click();
        } else {
          xhsUrlInput.focus();
          showStatus("请长按输入框直接粘贴小红书分享口令", "info");
        }
      } catch {
        xhsUrlInput.focus();
        showStatus("浏览器限制直接读取剪贴板，请长按输入框点击「粘贴」", "info");
      }
    });
  }

  // ==================== 参数联动与预设 ====================
  function updateParamLabels() {
    valSampleStep.textContent = `${Number(rngSampleStep.value).toFixed(2)} 秒`;
    valMotionThresh.textContent = Number(rngMotionThresh.value).toFixed(1);
    valMinHold.textContent = `${Number(rngMinHold.value).toFixed(2)} 秒`;
    valDedup.textContent = Number(rngDedup.value).toFixed(1);
    valFixedInterval.textContent = `${Number(rngFixedInterval.value).toFixed(1)} 秒`;

    const cropT = Number(rngCropTop.value);
    const cropB = Number(rngCropBottom.value);
    valCropTop.textContent = `${cropT}%`;
    valCropBottom.textContent = `${cropB}%`;

    if (cropT > 0) {
      cropOverlayTop.style.height = `${cropT}%`;
      cropOverlayTop.classList.remove("hidden");
    } else {
      cropOverlayTop.classList.add("hidden");
    }

    if (cropB > 0) {
      cropOverlayBottom.style.height = `${cropB}%`;
      cropOverlayBottom.classList.remove("hidden");
    } else {
      cropOverlayBottom.classList.add("hidden");
    }

    drawMotionChart();
  }

  function updateModeVisibility() {
    const mode = modeSelect.value;
    if (mode === "interval") {
      paramSampleStepBox.classList.add("hidden");
      paramMotionThreshBox.classList.add("hidden");
      paramMinHoldBox.classList.add("hidden");
      paramDedupBox.classList.add("hidden");
      paramFixedIntervalBox.classList.remove("hidden");
    } else if (mode === "change") {
      paramSampleStepBox.classList.remove("hidden");
      paramMotionThreshBox.classList.remove("hidden");
      paramMinHoldBox.classList.add("hidden");
      paramDedupBox.classList.remove("hidden");
      paramFixedIntervalBox.classList.add("hidden");
    } else {
      paramSampleStepBox.classList.remove("hidden");
      paramMotionThreshBox.classList.remove("hidden");
      paramMinHoldBox.classList.remove("hidden");
      paramDedupBox.classList.remove("hidden");
      paramFixedIntervalBox.classList.add("hidden");
    }
  }

  presetSelect.addEventListener("change", () => {
    const p = presetSelect.value;
    if (p === "standard") {
      modeSelect.value = "plateau";
      rngSampleStep.value = 0.15;
      rngMotionThresh.value = 6.5;
      rngMinHold.value = 0.35;
      rngDedup.value = 10.0;
    } else if (p === "fast") {
      modeSelect.value = "plateau";
      rngSampleStep.value = 0.08;
      rngMotionThresh.value = 8.0;
      rngMinHold.value = 0.20;
      rngDedup.value = 8.5;
    } else if (p === "dynamic") {
      modeSelect.value = "plateau";
      rngSampleStep.value = 0.16;
      rngMotionThresh.value = 12.0;
      rngMinHold.value = 0.40;
      rngDedup.value = 15.0;
    } else if (p === "interval") {
      modeSelect.value = "interval";
      rngFixedInterval.value = 1.5;
    }
    updateModeVisibility();
    updateParamLabels();
  });

  modeSelect.addEventListener("change", updateModeVisibility);
  [rngSampleStep, rngMotionThresh, rngMinHold, rngDedup, rngFixedInterval, rngCropTop, rngCropBottom].forEach(el => {
    el.addEventListener("input", updateParamLabels);
  });

  // ==================== 本地/相册视频加载 ====================
  dropAreaTrigger.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", e => {
    if (e.target.files && e.target.files[0]) {
      loadLocalVideoFile(e.target.files[0]);
    }
  });

  ["dragenter", "dragover"].forEach(evt => {
    dropZone.addEventListener(evt, e => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach(evt => {
    dropZone.addEventListener(evt, e => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove("drag-over");
    });
  });

  dropZone.addEventListener("drop", e => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      loadLocalVideoFile(e.dataTransfer.files[0]);
    }
  });

  function loadLocalVideoFile(file) {
    const cleanName = file.name.replace(/\.[^/.]+$/, "");
    const objUrl = URL.createObjectURL(file);
    switchMobileTab("workspace");
    loadVideoSource(objUrl, cleanName, false);
  }

  function loadVideoSource(url, title, autoStart = false) {
    switchMobileTab("workspace");
    videoPlayer.src = url;
    videoPlayer.load();
    currentVideoTitle.textContent = `📺 ${title}`;
    exportNameInput.value = title;
    videoEmptyPlaceholder.classList.add("hidden");
    videoMetaBadge.textContent = "正在读取视频信息...";

    const onReady = () => {
      const dur = videoPlayer.duration;
      const w = videoPlayer.videoWidth;
      const h = videoPlayer.videoHeight;
      videoMetaBadge.textContent = `${w}×${h} · 时长 ${dur.toFixed(1)}s`;
      btnStartExtract.disabled = false;
      btnStepBack.disabled = false;
      btnStepForward.disabled = false;
      btnManualCapture.disabled = false;
      drawMotionChart();
      if (autoStart) {
        startSmartExtraction();
      }
    };

    videoPlayer.onloadedmetadata = () => {
      if (!Number.isFinite(videoPlayer.duration) || videoPlayer.duration <= 0) {
        const fixDuration = () => {
          videoPlayer.removeEventListener("timeupdate", fixDuration);
          videoPlayer.currentTime = 0;
          videoPlayer.addEventListener("seeked", () => onReady(), { once: true });
        };
        videoPlayer.addEventListener("timeupdate", fixDuration);
        videoPlayer.currentTime = 1e7;
      } else {
        onReady();
      }
    };
  }

  videoPlayer.addEventListener("timeupdate", () => {
    currentTimeLabel.textContent = formatTime(videoPlayer.currentTime);
    drawMotionChart();
  });

  btnStepBack.addEventListener("click", () => {
    videoPlayer.pause();
    videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 0.1);
  });

  btnStepForward.addEventListener("click", () => {
    videoPlayer.pause();
    videoPlayer.currentTime = Math.min(videoPlayer.duration || 0, videoPlayer.currentTime + 0.1);
  });

  btnManualCapture.addEventListener("click", async () => {
    if (!videoPlayer.duration) return;
    videoPlayer.pause();
    const t = videoPlayer.currentTime;
    const snap = await captureFullResFrame(t);
    const newPage = {
      id: pageIdCounter++,
      time: t,
      holdDuration: 0,
      dataUrl: snap.dataUrl,
      width: snap.width,
      height: snap.height,
      selected: true,
      sourceType: "manual"
    };
    extractedPages.push(newPage);
    extractedPages.sort((a, b) => a.time - b.time);
    renderGallery();
    drawMotionChart();
  });

  // ==================== 小红书分享链接解析 (支持 PC 服务端 + 安卓原生 APK 双引擎) ====================
  btnParseUrl.addEventListener("click", async () => {
    const text = xhsUrlInput.value.trim();
    if (!text) {
      showStatus("请先粘贴小红书分享口令或链接！", "error");
      return;
    }

    btnParseUrl.disabled = true;
    btnParseUrl.textContent = "解析中...";
    showStatus("正在解析小红书链接并获取无水印媒体资源，请稍候...", "info");

    try {
      let data;
      if (isAndroidNativeApp && window.AndroidBridge.parseXhsShare) {
        const jsonStr = window.AndroidBridge.parseXhsShare(text, xhsCookieInput.value.trim());
        data = JSON.parse(jsonStr);
      } else {
        const resp = await fetch("/api/parse-xhs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            cookie: xhsCookieInput.value.trim()
          })
        });
        data = await resp.json();
      }

      if (!data.ok) {
        showStatus(data.error || "解析失败", "error");
        return;
      }

      if (data.mode === "video") {
        showStatus(`✅ 已成功解析视频笔记《${data.title}》，正在自动识别翻页画面...`, "success");
        loadVideoSource(data.videoUrl, data.title, true);
      } else if (data.mode === "images") {
        showStatus(`✅ 检测到该链接为「图文笔记」《${data.title}》，已直接提取全部 ${data.images.length} 张原图！`, "success");
        exportNameInput.value = data.title;
        await loadDirectImagesNote(data.images);
        switchMobileTab("gallery");
      }
    } catch (err) {
      showStatus(
        "当前处于纯离线单文件模式或未连接本地解析服务。请直接从手机相册选择录屏/下载好的视频文件进行扒图！",
        "error"
      );
    } finally {
      btnParseUrl.disabled = false;
      btnParseUrl.textContent = "解析载入";
    }
  });

  async function loadDirectImagesNote(images) {
    extractedPages = [];
    for (let i = 0; i < images.length; i++) {
      const item = images[i];
      const dataUrl = item.dataUrl || (await fetchImageAsDataUrl(item.proxyUrl || item.originalUrl));
      extractedPages.push({
        id: pageIdCounter++,
        time: i,
        holdDuration: 0,
        dataUrl,
        width: 0,
        height: 0,
        selected: true,
        sourceType: "direct-image"
      });
    }
    renderGallery();
  }

  function fetchImageAsDataUrl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        resolve(c.toDataURL("image/png"));
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  // 接收来自系统分享菜单 (Web Share Target 或 Android Intent.ACTION_SEND) 的内容
  window.onReceiveSharedText = function (sharedText) {
    if (!sharedText) return;
    switchMobileTab("input");
    xhsUrlInput.value = sharedText;
    btnParseUrl.click();
  };

  window.onReceiveSharedVideo = function (videoUri, title) {
    if (!videoUri) return;
    loadVideoSource(videoUri, title || "手机分享视频", true);
  };

  // 检查 URL 参数是否带有 PWA share_target 传来的内容
  const urlParams = new URLSearchParams(window.location.search);
  const sharedParam = urlParams.get("text") || urlParams.get("url") || "";
  if (sharedParam && sharedParam.includes("http")) {
    setTimeout(() => window.onReceiveSharedText(sharedParam), 300);
  }

  // ==================== 核心：智能翻页检测与原画提取算法 ====================
  function seekVideoTo(timeSec) {
    return new Promise(resolve => {
      const clamped = Math.max(0, Math.min(videoPlayer.duration || 0, timeSec));
      if (Math.abs(videoPlayer.currentTime - clamped) < 0.002) {
        resolve();
        return;
      }
      const onSeeked = () => {
        videoPlayer.removeEventListener("seeked", onSeeked);
        resolve();
      };
      videoPlayer.addEventListener("seeked", onSeeked, { once: true });
      videoPlayer.currentTime = clamped;
    });
  }

  const ANALYSIS_SIZE = 96;
  const analysisCanvas = document.createElement("canvas");
  analysisCanvas.width = ANALYSIS_SIZE;
  analysisCanvas.height = ANALYSIS_SIZE;
  const analysisCtx = analysisCanvas.getContext("2d", { willReadFrequently: true });

  function extractFrameFeatures(prevPixels) {
    const vw = videoPlayer.videoWidth;
    const vh = videoPlayer.videoHeight;
    const cropTopRatio = Number(rngCropTop.value) / 100;
    const cropBottomRatio = Number(rngCropBottom.value) / 100;

    const marginX = vw * 0.05;
    const topY = vh * Math.min(0.45, cropTopRatio + 0.04);
    const bottomY = vh * Math.max(0.55, 1 - cropBottomRatio - 0.05);
    const srcW = Math.max(16, vw - marginX * 2);
    const srcH = Math.max(16, bottomY - topY);

    analysisCtx.drawImage(
      videoPlayer,
      marginX,
      topY,
      srcW,
      srcH,
      0,
      0,
      ANALYSIS_SIZE,
      ANALYSIS_SIZE
    );

    const imgData = analysisCtx.getImageData(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE).data;
    const pixelCount = ANALYSIS_SIZE * ANALYSIS_SIZE;
    const gray = new Float32Array(pixelCount);
    const rgbCompact = new Uint8Array(pixelCount * 3);

    let motionSum = 0;
    for (let i = 0, p = 0, c = 0; i < imgData.length; i += 4, p++, c += 3) {
      const r = imgData[i];
      const g = imgData[i + 1];
      const b = imgData[i + 2];
      rgbCompact[c] = r;
      rgbCompact[c + 1] = g;
      rgbCompact[c + 2] = b;
      gray[p] = 0.299 * r + 0.587 * g + 0.114 * b;

      if (prevPixels) {
        motionSum +=
          (Math.abs(r - prevPixels[c]) +
            Math.abs(g - prevPixels[c + 1]) +
            Math.abs(b - prevPixels[c + 2])) /
          3;
      }
    }

    const motion = prevPixels ? motionSum / pixelCount : 0;

    let edgeSum = 0;
    for (let y = 1; y < ANALYSIS_SIZE - 1; y++) {
      const row = y * ANALYSIS_SIZE;
      for (let x = 1; x < ANALYSIS_SIZE - 1; x++) {
        const idx = row + x;
        const gx = Math.abs(gray[idx + 1] - gray[idx - 1]);
        const gy = Math.abs(gray[idx + ANALYSIS_SIZE] - gray[idx - ANALYSIS_SIZE]);
        edgeSum += gx + gy;
      }
    }
    const sharpness = edgeSum / ((ANALYSIS_SIZE - 2) * (ANALYSIS_SIZE - 2));

    const GRID = 16;
    const blockSize = ANALYSIS_SIZE / GRID;
    const fingerprint = new Float32Array(GRID * GRID * 3);
    for (let by = 0; by < GRID; by++) {
      for (let bx = 0; bx < GRID; bx++) {
        let sr = 0, sg = 0, sb = 0;
        for (let dy = 0; dy < blockSize; dy++) {
          for (let dx = 0; dx < blockSize; dx++) {
            const py = by * blockSize + dy;
            const px = bx * blockSize + dx;
            const base = (py * ANALYSIS_SIZE + px) * 3;
            sr += rgbCompact[base];
            sg += rgbCompact[base + 1];
            sb += rgbCompact[base + 2];
          }
        }
        const area = blockSize * blockSize;
        const fIdx = (by * GRID + bx) * 3;
        fingerprint[fIdx] = sr / area;
        fingerprint[fIdx + 1] = sg / area;
        fingerprint[fIdx + 2] = sb / area;
      }
    }

    return {
      motion,
      sharpness,
      rgbCompact,
      fingerprint
    };
  }

  function computePageFingerprintDiff(fpA, fpB) {
    if (!fpA || !fpB) return 999;
    const blockCount = fpA.length / 3;
    const blockDiffs = new Float32Array(blockCount);
    let totalDiff = 0;

    for (let i = 0; i < blockCount; i++) {
      const idx = i * 3;
      const d =
        (Math.abs(fpA[idx] - fpB[idx]) +
          Math.abs(fpA[idx + 1] - fpB[idx + 1]) +
          Math.abs(fpA[idx + 2] - fpB[idx + 2])) /
        3;
      blockDiffs[i] = d;
      totalDiff += d;
    }

    const meanDiff = totalDiff / blockCount;
    blockDiffs.sort();
    const topStart = Math.floor(blockCount * 0.85);
    let topSum = 0;
    for (let i = topStart; i < blockCount; i++) {
      topSum += blockDiffs[i];
    }
    const top15Diff = topSum / (blockCount - topStart);

    return meanDiff * 0.4 + top15Diff * 0.6;
  }

  async function captureFullResFrame(timeSec) {
    await seekVideoTo(timeSec);
    const vw = videoPlayer.videoWidth;
    const vh = videoPlayer.videoHeight;
    const cropTopRatio = Number(rngCropTop.value) / 100;
    const cropBottomRatio = Number(rngCropBottom.value) / 100;

    const srcY = Math.round(vh * cropTopRatio);
    const srcBottom = Math.round(vh * (1 - cropBottomRatio));
    const outH = Math.max(10, srcBottom - srcY);

    const canvas = document.createElement("canvas");
    canvas.width = vw;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoPlayer, 0, srcY, vw, outH, 0, 0, vw, outH);

    const fmt = exportFormatSelect.value === "jpg" ? "image/jpeg" : "image/png";
    const quality = fmt === "image/jpeg" ? 0.95 : undefined;
    return {
      dataUrl: canvas.toDataURL(fmt, quality),
      width: vw,
      height: outH
    };
  }

  btnStartExtract.addEventListener("click", () => startSmartExtraction());
  btnStopExtract.addEventListener("click", () => {
    stopRequested = true;
  });

  async function startSmartExtraction() {
    if (isExtracting || !videoPlayer.duration) return;
    isExtracting = true;
    stopRequested = false;
    videoPlayer.pause();

    btnStartExtract.disabled = true;
    btnStopExtract.classList.remove("hidden");
    progressContainer.classList.remove("hidden");
    exportResultBanner.classList.add("hidden");

    const duration = videoPlayer.duration;
    const mode = modeSelect.value;
    const sampleStep = Number(rngSampleStep.value);
    const motionThreshold = Number(rngMotionThresh.value);
    const minHoldSec = Number(rngMinHold.value);
    const dedupThreshold = Number(rngDedup.value);
    const fixedInterval = Number(rngFixedInterval.value);

    extractedPages = [];
    motionSamples = [];
    renderGallery();

    try {
      if (mode === "interval") {
        const times = [];
        for (let t = 0.1; t < duration; t += fixedInterval) {
          times.push(t);
        }
        for (let i = 0; i < times.length; i++) {
          if (stopRequested) break;
          const t = times[i];
          const pct = Math.round(((i + 1) / times.length) * 100);
          progressText.textContent = `正在按固定间隔抓取第 ${i + 1} / ${times.length} 张 (${formatTime(t)})...`;
          progressPercent.textContent = `${pct}%`;
          progressBarFill.style.width = `${pct}%`;

          const snap = await captureFullResFrame(t);
          extractedPages.push({
            id: pageIdCounter++,
            time: t,
            holdDuration: fixedInterval,
            dataUrl: snap.dataUrl,
            width: snap.width,
            height: snap.height,
            selected: true,
            sourceType: "auto"
          });
          renderGallery();
        }
      } else {
        const timestamps = [];
        for (let t = 0.05; t < duration - 0.02; t += sampleStep) {
          timestamps.push(Number(t.toFixed(3)));
        }

        let prevPixels = null;
        for (let i = 0; i < timestamps.length; i++) {
          if (stopRequested) break;
          const t = timestamps[i];
          await seekVideoTo(t);
          const feat = extractFrameFeatures(prevPixels);
          prevPixels = feat.rgbCompact;

          motionSamples.push({
            index: i,
            time: t,
            motion: i === 0 ? 0 : feat.motion,
            sharpness: feat.sharpness,
            fingerprint: feat.fingerprint
          });

          if (i % 3 === 0 || i === timestamps.length - 1) {
            const pct = Math.round(((i + 1) / timestamps.length) * 75);
            progressText.textContent = `阶段 1/2：扫描翻页转场 (${formatTime(t)} / ${formatTime(duration)})`;
            progressPercent.textContent = `${pct}%`;
            progressBarFill.style.width = `${pct}%`;
            drawMotionChart();
            await new Promise(r => setTimeout(r, 0));
          }
        }

        const candidatePages = [];
        if (mode === "plateau") {
          const minSamples = Math.max(2, Math.ceil(minHoldSec / sampleStep));
          let i = 0;
          while (i < motionSamples.length) {
            if (motionSamples[i].motion <= motionThreshold) {
              let j = i;
              while (
                j + 1 < motionSamples.length &&
                motionSamples[j + 1].motion <= motionThreshold
              ) {
                j++;
              }
              const runCount = j - i + 1;
              const holdDuration = runCount * sampleStep;

              if (runCount >= minSamples || (i === 0 && runCount >= 2)) {
                const margin = Math.floor(runCount * 0.2);
                const pickStart = i + margin;
                const pickEnd = Math.max(pickStart, j - margin);

                let bestIdx = Math.floor((i + j) / 2);
                let bestScore = -Infinity;
                for (let k = pickStart; k <= pickEnd; k++) {
                  const s = motionSamples[k];
                  const score = s.sharpness * 0.25 - s.motion * 2.0;
                  if (score > bestScore) {
                    bestScore = score;
                    bestIdx = k;
                  }
                }

                candidatePages.push({
                  sample: motionSamples[bestIdx],
                  holdDuration
                });
              }
              i = j + 1;
            } else {
              i++;
            }
          }
        } else if (mode === "change") {
          for (let i = 0; i < motionSamples.length; i++) {
            const s = motionSamples[i];
            if (i === 0 || s.motion > motionThreshold) {
              let settleIdx = Math.min(motionSamples.length - 1, i + 2);
              while (
                settleIdx + 1 < motionSamples.length &&
                motionSamples[settleIdx].motion > motionThreshold * 0.7
              ) {
                settleIdx++;
              }
              candidatePages.push({
                sample: motionSamples[settleIdx],
                holdDuration: sampleStep * 3
              });
              i = settleIdx + 1;
            }
          }
        }

        const uniqueCandidates = [];
        for (const cand of candidatePages) {
          if (uniqueCandidates.length === 0) {
            uniqueCandidates.push(cand);
          } else {
            const prev = uniqueCandidates[uniqueCandidates.length - 1];
            const diff = computePageFingerprintDiff(
              cand.sample.fingerprint,
              prev.sample.fingerprint
            );
            if (diff >= dedupThreshold) {
              uniqueCandidates.push(cand);
            } else {
              prev.holdDuration += cand.holdDuration;
              if (cand.sample.sharpness > prev.sample.sharpness) {
                prev.sample = cand.sample;
              }
            }
          }
        }

        for (let idx = 0; idx < uniqueCandidates.length; idx++) {
          if (stopRequested) break;
          const item = uniqueCandidates[idx];
          const pct = 75 + Math.round(((idx + 1) / uniqueCandidates.length) * 25);
          progressText.textContent = `阶段 2/2：正在导出第 ${idx + 1} / ${uniqueCandidates.length} 页原画高清图...`;
          progressPercent.textContent = `${pct}%`;
          progressBarFill.style.width = `${pct}%`;

          const snap = await captureFullResFrame(item.sample.time);
          extractedPages.push({
            id: pageIdCounter++,
            time: item.sample.time,
            holdDuration: item.holdDuration,
            dataUrl: snap.dataUrl,
            width: snap.width,
            height: snap.height,
            selected: true,
            sourceType: "auto"
          });
          renderGallery();
          drawMotionChart();
        }
      }

      progressText.textContent = `✅ 提取完成！共识别并扒下 ${extractedPages.length} 页高清图片`;
      progressPercent.textContent = "100%";
      progressBarFill.style.width = "100%";

      if (window.innerWidth <= 768 && extractedPages.length > 0) {
        setTimeout(() => switchMobileTab("gallery"), 400);
      }
    } finally {
      isExtracting = false;
      btnStartExtract.disabled = false;
      btnStopExtract.classList.add("hidden");
    }
  }

  // ==================== 运动曲线时间轴 ====================
  function drawMotionChart() {
    const ctx = motionChartCanvas.getContext("2d");
    const w = motionChartCanvas.width;
    const h = motionChartCanvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, w, h);

    const duration = videoPlayer.duration || 1;
    const thresh = Number(rngMotionThresh.value);
    const maxY = Math.max(32, thresh * 3);

    const threshY = h - (thresh / maxY) * (h - 22) - 10;
    ctx.strokeStyle = "rgba(148, 163, 184, 0.45)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, threshY);
    ctx.lineTo(w, threshY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px sans-serif";
    ctx.fillText(`静止阈值 (${thresh})`, 8, Math.max(12, threshY - 5));

    if (motionSamples.length > 1) {
      ctx.beginPath();
      for (let i = 0; i < motionSamples.length; i++) {
        const s = motionSamples[i];
        const x = (s.time / duration) * w;
        const clampedM = Math.min(maxY, s.motion);
        const y = h - (clampedM / maxY) * (h - 22) - 10;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "#fb7185";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    extractedPages.forEach((p, idx) => {
      if (p.sourceType === "direct-image") return;
      const x = (p.time / duration) * w;
      ctx.strokeStyle = "rgba(16, 185, 129, 0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();

      ctx.fillStyle = "#10b981";
      ctx.beginPath();
      ctx.arc(x, h - 14, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ecfdf5";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText(`P${idx + 1}`, x - 8, h - 23);
    });

    if (videoPlayer.duration) {
      const curX = (videoPlayer.currentTime / duration) * w;
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(curX, 0);
      ctx.lineTo(curX, h);
      ctx.stroke();
    }
  }

  motionChartCanvas.addEventListener("click", e => {
    if (!videoPlayer.duration) return;
    const rect = motionChartCanvas.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    videoPlayer.currentTime = Math.max(0, Math.min(videoPlayer.duration, ratio * videoPlayer.duration));
  });

  // ==================== 画廊渲染与单页微调 ====================
  function renderGallery() {
    const total = extractedPages.length;
    const selectedCount = extractedPages.filter(p => p.selected).length;
    galleryStatsBadge.textContent = `共 ${total} 页 · 已选 ${selectedCount} 页`;

    if (mobileGalleryBadge) {
      if (total > 0) {
        mobileGalleryBadge.textContent = String(total);
        mobileGalleryBadge.classList.remove("hidden");
      } else {
        mobileGalleryBadge.classList.add("hidden");
      }
    }

    const hasPages = total > 0;
    btnSelectAll.disabled = !hasPages;
    btnInvertSelect.disabled = !hasPages;
    btnClearAll.disabled = !hasPages;
    if (btnSaveMobileGallery) btnSaveMobileGallery.disabled = selectedCount === 0;
    btnSaveToFolder.disabled = selectedCount === 0;
    btnDownloadZip.disabled = selectedCount === 0;

    if (!hasPages) {
      pagesGrid.innerHTML = `
        <div class="empty-gallery">
          <div class="empty-icon">📑</div>
          <p>提取出的每一页图片会按顺序展示在这里</p>
          <p class="empty-sub">支持单页前后 <code>±0.1秒</code> 微调重抓、大图预览、一键存入手机相册或导出文件夹</p>
        </div>
      `;
      return;
    }

    pagesGrid.innerHTML = "";
    extractedPages.forEach((page, idx) => {
      const pageNumStr = String(idx + 1).padStart(2, "0");
      const card = document.createElement("div");
      card.className = `page-card ${page.selected ? "selected" : ""}`;

      const isVideoFrame = page.sourceType !== "direct-image";
      const timeBadgeHtml = isVideoFrame
        ? `<span class="time-pill" data-action="seek" title="点击将视频跳转到该时间点">${formatTime(page.time)}</span>`
        : `<span class="time-pill">原图 #${idx + 1}</span>`;

      const holdBadgeHtml =
        isVideoFrame && page.holdDuration > 0
          ? `<span class="hold-badge">停留 ${page.holdDuration.toFixed(1)}s</span>`
          : "";

      const nudgeBtnsHtml = isVideoFrame
        ? `
          <div class="nudge-group">
            <button class="btn btn-xs btn-outline" data-action="nudge-back" title="向前微调 0.1 秒重新抓图">-0.1s</button>
            <button class="btn btn-xs btn-outline" data-action="nudge-forward" title="向后微调 0.1 秒重新抓图">+0.1s</button>
          </div>
        `
        : `<div></div>`;

      card.innerHTML = `
        <div class="page-card-top">
          <label class="page-check-label">
            <input type="checkbox" data-action="toggle" ${page.selected ? "checked" : ""} />
            <span>第 ${pageNumStr} 页</span>
          </label>
          ${timeBadgeHtml}
        </div>
        <div class="page-thumb-wrap" data-action="preview" title="点击放大预览（手机端长按图片也可直接保存）">
          <img src="${page.dataUrl}" alt="第 ${pageNumStr} 页" loading="lazy" />
          ${holdBadgeHtml}
        </div>
        <div class="page-card-actions">
          ${nudgeBtnsHtml}
          <div class="nudge-group">
            <button class="btn btn-xs btn-outline" data-action="download-one" title="单独保存此页">⬇</button>
            <button class="btn btn-xs btn-danger" data-action="delete" title="剔除此页">✕</button>
          </div>
        </div>
      `;

      card.querySelector('[data-action="toggle"]').addEventListener("change", e => {
        page.selected = e.target.checked;
        renderGallery();
      });

      const seekEl = card.querySelector('[data-action="seek"]');
      if (seekEl) {
        seekEl.addEventListener("click", () => {
          switchMobileTab("workspace");
          videoPlayer.pause();
          videoPlayer.currentTime = page.time;
        });
      }

      card.querySelector('[data-action="preview"]').addEventListener("click", () => {
        openLightbox(idx);
      });

      const btnBack = card.querySelector('[data-action="nudge-back"]');
      if (btnBack) {
        btnBack.addEventListener("click", () => nudgePageFrame(page, -0.1));
      }

      const btnFwd = card.querySelector('[data-action="nudge-forward"]');
      if (btnFwd) {
        btnFwd.addEventListener("click", () => nudgePageFrame(page, 0.1));
      }

      card.querySelector('[data-action="download-one"]').addEventListener("click", () => {
        const ext = exportFormatSelect.value === "jpg" ? "jpg" : "png";
        const fname = `page_${pageNumStr}.${ext}`;
        if (isAndroidNativeApp && window.AndroidBridge.saveImageToGallery) {
          const folder = exportNameInput.value.trim() || "小红书翻页图集";
          window.AndroidBridge.saveImageToGallery(page.dataUrl, fname, folder);
          exportResultBanner.innerHTML = `<span>✅ 已将 <strong>${fname}</strong> 存入手机系统相册 <code>Pictures/小红书扒图/${folder}</code></span>`;
          exportResultBanner.classList.remove("hidden");
        } else {
          triggerBrowserDownload(page.dataUrl, fname);
        }
      });

      card.querySelector('[data-action="delete"]').addEventListener("click", () => {
        extractedPages = extractedPages.filter(item => item.id !== page.id);
        renderGallery();
        drawMotionChart();
      });

      pagesGrid.appendChild(card);
    });
  }

  async function nudgePageFrame(page, deltaSec) {
    if (!videoPlayer.duration) return;
    const newTime = Math.max(0, Math.min(videoPlayer.duration - 0.02, page.time + deltaSec));
    page.time = newTime;
    const snap = await captureFullResFrame(newTime);
    page.dataUrl = snap.dataUrl;
    page.width = snap.width;
    page.height = snap.height;
    renderGallery();
    drawMotionChart();
  }

  btnSelectAll.addEventListener("click", () => {
    extractedPages.forEach(p => (p.selected = true));
    renderGallery();
  });

  btnInvertSelect.addEventListener("click", () => {
    extractedPages.forEach(p => (p.selected = !p.selected));
    renderGallery();
  });

  btnClearAll.addEventListener("click", () => {
    extractedPages = [];
    renderGallery();
    drawMotionChart();
  });

  // ==================== 手机端一键批量存相册 / 系统分享 ====================
  if (btnSaveMobileGallery) {
    btnSaveMobileGallery.addEventListener("click", async () => {
      const selected = extractedPages.filter(p => p.selected);
      if (selected.length === 0) return;
      const ext = exportFormatSelect.value === "jpg" ? "jpg" : "png";
      const mime = ext === "jpg" ? "image/jpeg" : "image/png";
      const folderName = (exportNameInput.value.trim() || "小红书翻页图集").replace(/[\\/:*?"<>|]/g, "_");

      // 1. 若在安卓原生 APK 内运行，直接调用 MediaStore 原生接口写入系统相册
      if (isAndroidNativeApp && window.AndroidBridge.saveImageToGallery) {
        btnSaveMobileGallery.disabled = true;
        btnSaveMobileGallery.textContent = "正在存入相册...";
        try {
          let okCount = 0;
          for (let i = 0; i < selected.length; i++) {
            const fname = `page_${String(i + 1).padStart(2, "0")}.${ext}`;
            const saved = window.AndroidBridge.saveImageToGallery(selected[i].dataUrl, fname, folderName);
            if (saved) okCount++;
          }
          exportResultBanner.innerHTML = `
            <span>🎉 已将 <strong>${okCount}</strong> 张高清图片直接写入手机系统相册：<code>Pictures/小红书扒图/${folderName}</code>！</span>
          `;
          exportResultBanner.classList.remove("hidden");
        } finally {
          btnSaveMobileGallery.disabled = false;
          btnSaveMobileGallery.textContent = "📲 批量存到手机相册";
        }
        return;
      }

      // 2. 若在手机浏览器 / PWA 中运行，优先使用 Web Share API 批量分享/保存到手机相册
      try {
        const fileObjs = selected.map((p, idx) => {
          const base64 = p.dataUrl.split(",")[1];
          const bin = atob(base64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const fname = `page_${String(idx + 1).padStart(2, "0")}.${ext}`;
          return new File([bytes], fname, { type: mime });
        });

        if (navigator.canShare && navigator.canShare({ files: fileObjs })) {
          await navigator.share({
            files: fileObjs,
            title: folderName,
            text: `共 ${fileObjs.length} 张小红书翻页提取高清图`
          });
          return;
        }
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }

      // 3. 降级方案：逐张触发浏览器下载保存
      for (let i = 0; i < selected.length; i++) {
        const fname = `${folderName}_P${String(i + 1).padStart(2, "0")}.${ext}`;
        triggerBrowserDownload(selected[i].dataUrl, fname);
        await new Promise(r => setTimeout(r, 180));
      }
      exportResultBanner.innerHTML = `
        <span>📥 已触发 <strong>${selected.length}</strong> 张图片逐张保存至手机「下载 (Downloads)」目录（相册可自动识别）！</span>
      `;
      exportResultBanner.classList.remove("hidden");
    });
  }

  // ==================== Lightbox 大图预览 ====================
  function openLightbox(index) {
    if (index < 0 || index >= extractedPages.length) return;
    currentLightboxIndex = index;
    const page = extractedPages[index];
    const numStr = String(index + 1).padStart(2, "0");
    lightboxTitle.textContent = `第 ${numStr} / ${extractedPages.length} 页 (${formatTime(page.time)})`;
    lightboxImg.src = page.dataUrl;
    lightboxModal.classList.remove("hidden");
  }

  function closeLightbox() {
    lightboxModal.classList.add("hidden");
    currentLightboxIndex = -1;
  }

  btnLightboxClose.addEventListener("click", closeLightbox);
  lightboxBackdrop.addEventListener("click", closeLightbox);
  btnLightboxPrev.addEventListener("click", () => {
    if (currentLightboxIndex > 0) openLightbox(currentLightboxIndex - 1);
  });
  btnLightboxNext.addEventListener("click", () => {
    if (currentLightboxIndex < extractedPages.length - 1) openLightbox(currentLightboxIndex + 1);
  });

  window.addEventListener("keydown", e => {
    if (lightboxModal.classList.contains("hidden")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft" && currentLightboxIndex > 0) openLightbox(currentLightboxIndex - 1);
    if (e.key === "ArrowRight" && currentLightboxIndex < extractedPages.length - 1) {
      openLightbox(currentLightboxIndex + 1);
    }
  });

  // ==================== 电脑端导出文件夹 & 通用 ZIP 打包 ====================
  btnSaveToFolder.addEventListener("click", async () => {
    const selected = extractedPages.filter(p => p.selected);
    if (selected.length === 0) return;

    const ext = exportFormatSelect.value === "jpg" ? "jpg" : "png";
    const folderName = exportNameInput.value.trim() || "小红书翻页图集";

    btnSaveToFolder.disabled = true;
    btnSaveToFolder.textContent = "正在写入磁盘...";

    try {
      const payload = {
        folderName,
        openExplorer: true,
        images: selected.map((p, idx) => ({
          filename: `page_${String(idx + 1).padStart(2, "0")}.${ext}`,
          dataUrl: p.dataUrl
        }))
      };

      const resp = await fetch("/api/save-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const res = await resp.json();
      if (res.ok) {
        exportResultBanner.innerHTML = `
          <span>🎉 已成功将 <strong>${res.savedCount}</strong> 张高清图片导出至本地目录：<code>${res.folderPath}</code>（已自动打开文件夹）</span>
        `;
        exportResultBanner.classList.remove("hidden");
      } else {
        alert("导出失败: " + (res.error || "未知错误"));
      }
    } catch (err) {
      alert("本地服务通信失败，请使用「打包下载 ZIP」或「批量存到手机相册」: " + err.message);
    } finally {
      btnSaveToFolder.disabled = false;
      btnSaveToFolder.textContent = "📂 导出到电脑文件夹";
    }
  });

  if (btnOpenExports) {
    btnOpenExports.addEventListener("click", async () => {
      try {
        await fetch("/api/open-exports", { method: "POST" });
      } catch (e) {
        alert("无法打开导出目录: " + e.message);
      }
    });
  }

  function triggerBrowserDownload(url, filename) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  btnDownloadZip.addEventListener("click", () => {
    const selected = extractedPages.filter(p => p.selected);
    if (selected.length === 0) return;
    const ext = exportFormatSelect.value === "jpg" ? "jpg" : "png";
    const folderName = (exportNameInput.value.trim() || "小红书翻页图集").replace(/[\\/:*?"<>|]/g, "_");

    const files = selected.map((p, idx) => {
      const base64 = p.dataUrl.split(",")[1];
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return {
        name: `${folderName}/page_${String(idx + 1).padStart(2, "0")}.${ext}`,
        data: bytes
      };
    });

    const zipBlob = buildZipBlob(files);
    const zipUrl = URL.createObjectURL(zipBlob);
    triggerBrowserDownload(zipUrl, `${folderName}_${selected.length}P.zip`);
    setTimeout(() => URL.revokeObjectURL(zipUrl), 10000);
  });

  function buildZipBlob(files) {
    const crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c >>> 0;
    }

    function crc32(bytes) {
      let crc = 0xffffffff;
      for (let i = 0; i < bytes.length; i++) {
        crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
      }
      return (crc ^ 0xffffffff) >>> 0;
    }

    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = encoder.encode(file.name);
      const crc = crc32(file.data);
      const size = file.data.length;

      const localHeader = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(localHeader.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, 0, true);
      lv.setUint16(12, 0, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true);
      lv.setUint32(22, size, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);

      localParts.push(localHeader, file.data);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(centralHeader.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      centralHeader.set(nameBytes, 46);

      centralParts.push(centralHeader);
      offset += localHeader.length + size;
    }

    const centralSize = centralParts.reduce((acc, arr) => acc + arr.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    return new Blob([...localParts, ...centralParts, eocd], { type: "application/zip" });
  }

  // ==================== 手机端扫码与离线/APK 弹窗 ====================
  if (btnMobileModal) {
    btnMobileModal.addEventListener("click", async () => {
      mobileGuideModal.classList.remove("hidden");
      try {
        const resp = await fetch("/api/server-info");
        const info = await resp.json();
        if (info.ok && info.lanUrl) {
          lanUrlLink.href = info.lanUrl;
          lanUrlLink.textContent = info.lanUrl;
          renderQrCodeToCanvas(lanQrCanvas, info.lanUrl);
          if (info.hasApk && btnDirectDownloadApk) {
            btnDirectDownloadApk.classList.remove("hidden");
          }
        }
      } catch {
        const fallbackUrl = window.location.href;
        lanUrlLink.href = fallbackUrl;
        lanUrlLink.textContent = fallbackUrl;
        renderQrCodeToCanvas(lanQrCanvas, fallbackUrl);
      }
    });
  }

  if (btnCloseMobileModal) {
    btnCloseMobileModal.addEventListener("click", () => mobileGuideModal.classList.add("hidden"));
  }
  if (mobileGuideBackdrop) {
    mobileGuideBackdrop.addEventListener("click", () => mobileGuideModal.classList.add("hidden"));
  }

  // 纯前端零依赖标准 QR Code 生成器 (支持任意 1~53 字节 URL，Version 3, 29x29, ECC Level L)
  function renderQrCodeToCanvas(canvas, text) {
    const bytes = new TextEncoder().encode(text);
    // 若长度 <= 32 使用 Version 2 (25x25)，<= 53 使用 Version 3 (29x29)，<= 78 使用 Version 4 (33x33)
    const verCfg =
      bytes.length <= 32
        ? { ver: 2, size: 25, totalData: 34, ecLen: 10, align: [6, 18] }
        : bytes.length <= 53
        ? { ver: 3, size: 29, totalData: 55, ecLen: 15, align: [6, 22] }
        : { ver: 4, size: 33, totalData: 80, ecLen: 20, align: [6, 26] };

    const { size, totalData, ecLen, align } = verCfg;
    const matrix = Array.from({ length: size }, () => new Int8Array(size));
    const reserved = Array.from({ length: size }, () => new Uint8Array(size));

    function setMod(r, c, val, isRes = true) {
      if (r < 0 || r >= size || c < 0 || c >= size) return;
      matrix[r][c] = val ? 1 : 0;
      if (isRes) reserved[r][c] = 1;
    }

    function drawFinder(r0, c0) {
      for (let dr = -1; dr <= 7; dr++) {
        for (let dc = -1; dc <= 7; dc++) {
          const r = r0 + dr, c = c0 + dc;
          if (r < 0 || r >= size || c < 0 || c >= size) continue;
          const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
          const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
          const onBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
          setMod(r, c, (inOuter && onBorder) || inInner, true);
        }
      }
    }

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    // Alignment pattern
    const ar = align[1], ac = align[1];
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const isDark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
        setMod(ar + dr, ac + dc, isDark, true);
      }
    }

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      setMod(6, i, i % 2 === 0, true);
      setMod(i, 6, i % 2 === 0, true);
    }

    // Dark module & reserve format areas
    setMod(size - 8, 8, 1, true);
    for (let i = 0; i < 9; i++) {
      if (!reserved[8][i]) setMod(8, i, 0, true);
      if (!reserved[i][8]) setMod(i, 8, 0, true);
    }
    for (let i = 0; i < 8; i++) {
      if (!reserved[8][size - 1 - i]) setMod(8, size - 1 - i, 0, true);
      if (!reserved[size - 1 - i][8]) setMod(size - 1 - i, 8, 0, true);
    }

    // 编码数据位 (Byte mode = 0100)
    const bits = [];
    function pushBits(val, len) {
      for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
    }
    pushBits(0b0100, 4);
    pushBits(bytes.length, 8);
    for (const b of bytes) pushBits(b, 8);
    pushBits(0, Math.min(4, totalData * 8 - bits.length));
    while (bits.length % 8 !== 0) bits.push(0);

    const dataCodewords = new Uint8Array(totalData);
    for (let i = 0; i < bits.length / 8 && i < totalData; i++) {
      let v = 0;
      for (let b = 0; b < 8; b++) v = (v << 1) | bits[i * 8 + b];
      dataCodewords[i] = v;
    }
    const padBytes = [0xec, 0x11];
    for (let i = Math.floor(bits.length / 8), p = 0; i < totalData; i++, p ^= 1) {
      dataCodewords[i] = padBytes[p];
    }

    // Reed-Solomon 纠错码计算 (GF(256), poly 0x11d)
    const gfExp = new Uint8Array(512);
    const gfLog = new Uint8Array(256);
    let x = 1;
    for (let i = 0; i < 255; i++) {
      gfExp[i] = x;
      gfLog[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) gfExp[i] = gfExp[i - 255];

    function gfMul(a, b) {
      return a === 0 || b === 0 ? 0 : gfExp[gfLog[a] + gfLog[b]];
    }

    let gen = new Uint8Array([1]);
    for (let i = 0; i < ecLen; i++) {
      const next = new Uint8Array(gen.length + 1);
      const factor = gfExp[i];
      for (let j = 0; j < gen.length; j++) {
        next[j] ^= gen[j];
        next[j + 1] ^= gfMul(gen[j], factor);
      }
      gen = next;
    }

    const ecCodewords = new Uint8Array(ecLen);
    for (let i = 0; i < totalData; i++) {
      const factor = dataCodewords[i] ^ ecCodewords[0];
      for (let j = 0; j < ecLen - 1; j++) ecCodewords[j] = ecCodewords[j + 1];
      ecCodewords[ecLen - 1] = 0;
      for (let j = 0; j < ecLen; j++) {
        ecCodewords[j] ^= gfMul(gen[j + 1], factor);
      }
    }

    const allBits = [];
    for (const cw of dataCodewords) pushTo(allBits, cw);
    for (const cw of ecCodewords) pushTo(allBits, cw);
    function pushTo(arr, byteVal) {
      for (let i = 7; i >= 0; i--) arr.push((byteVal >>> i) & 1);
    }

    // 填充数据模块 (Zigzag upward/downward)
    let bitIdx = 0;
    let upward = true;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (let step = 0; step < size; step++) {
        const row = upward ? size - 1 - step : step;
        for (let dc = 0; dc < 2; dc++) {
          const c = col - dc;
          if (!reserved[row][c]) {
            const bit = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
            // Mask pattern 0: (row + c) % 2 === 0
            const masked = (row + c) % 2 === 0 ? bit ^ 1 : bit;
            matrix[row][c] = masked;
          }
        }
      }
      upward = !upward;
    }

    // 写入 Format Info (ECC Level L = 01, Mask 0 = 000 -> Format bits = 0x77c4)
    const fmtBits = 0x77c4;
    const fmtCoords1 = [
      [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
      [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
    ];
    const fmtCoords2 = [
      [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8], [size - 5, 8], [size - 6, 8], [size - 7, 8],
      [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5], [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1]
    ];
    for (let i = 0; i < 15; i++) {
      const bit = (fmtBits >>> i) & 1;
      matrix[fmtCoords1[i][0]][fmtCoords1[i][1]] = bit;
      matrix[fmtCoords2[i][0]][fmtCoords2[i][1]] = bit;
    }

    // 绘制到 Canvas
    const ctx = canvas.getContext("2d");
    const pad = 3;
    const totalMods = size + pad * 2;
    const scale = Math.floor(canvas.width / totalMods);
    const offset = Math.floor((canvas.width - totalMods * scale) / 2);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#1f2329";
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (matrix[r][c]) {
          ctx.fillRect(offset + (c + pad) * scale, offset + (r + pad) * scale, scale, scale);
        }
      }
    }
  }

  // ==================== 内置演示：合成一段带 3D 翻书转场的 5 页小红书视频 ====================
  btnLoadDemo.addEventListener("click", async () => {
    btnLoadDemo.disabled = true;
    const origText = btnLoadDemo.textContent;
    btnLoadDemo.textContent = "⏳ 生成翻页视频...";

    try {
      const demoBlob = await synthesizeDemoFlipVideo();
      const demoUrl = URL.createObjectURL(demoBlob);
      loadVideoSource(demoUrl, "小红书翻书干货演示_5页合集", true);
    } finally {
      btnLoadDemo.disabled = false;
      btnLoadDemo.textContent = origText;
    }
  });

  async function synthesizeDemoFlipVideo() {
    const W = 720;
    const H = 960;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    const demoPages = [
      {
        bg: "#fff8f1",
        accent: "#ff2442",
        tag: "📕 年度高分书单 · 第 1 页",
        title: "为什么小红书翻页视频\n手动截图总是截不好？",
        lines: [
          "1. 翻页转场速度快，手动暂停容易截到半翻页残影",
          "2. 屏幕上有播放进度条或倍速浮层干扰",
          "3. 十几页的书单合集一张张暂停裁剪太费时",
          "✨ 本工具自动识别静止帧，跳过翻书动画直接存原图！"
        ]
      },
      {
        bg: "#f4f9ff",
        accent: "#2563eb",
        tag: "📘 核心原理 · 第 2 页",
        title: "智能静止期 (Plateau)\n+ 清晰度峰值选取算法",
        lines: [
          "• 自动扫描全片帧间运动曲线，过滤翻页波峰",
          "• 定位每一页停稳展示的「静止平台期」",
          "• 在静止期内部挑选边缘锐度最高的一帧",
          "• 局部文字感知去重：同背景模板不同文字绝不漏页"
        ]
      },
      {
        bg: "#f2fbf7",
        accent: "#059669",
        tag: "📗 实用技巧 · 第 3 页",
        title: "手机录屏有状态栏？\n一键上下裁边直接导出",
        lines: [
          "• 拖动「顶部/底部裁除比例」滑块",
          "• 视频预览窗实时显示红色虚线裁剪遮罩",
          "• 导出的每一页图片自动切除上下黑边与状态栏",
          "• 省去后期再把十几张图挨个裁剪的麻烦"
        ]
      },
      {
        bg: "#fdf4ff",
        accent: "#9333ea",
        tag: "📙 细节控必备 · 第 4 页",
        title: "支持单页 ±0.1秒 微调\n与随时手动补抓画面",
        lines: [
          "• 下方每张卡片均配有 [-0.1s] 与 [+0.1s] 按钮",
          "• 点击卡片上的时间标签，视频立即同步跳转",
          "• 暂停在任意喜欢的位置可点击「补抓当前帧」",
          "• 点击缩略图可开启全屏大图对比模式"
        ]
      },
      {
        bg: "#fffbeb",
        accent: "#d97706",
        tag: "📓 手机端体验 · 第 5 页",
        title: "支持手机相册一键直存\n与安卓系统分享直达",
        lines: [
          "• 手机端点击「批量存到手机相册」直接写入系统相册",
          "• 支持添加到手机主屏幕 (PWA) 全屏运行",
          "• 安卓原生 APK 支持从小红书直接点「分享」唤起",
          "🎉 现在就选一段翻页视频试试吧！"
        ]
      }
    ];

    function renderPageToCanvas(pageObj, pageIndex) {
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const g = c.getContext("2d");

      g.fillStyle = pageObj.bg;
      g.fillRect(0, 0, W, H);

      g.strokeStyle = pageObj.accent;
      g.lineWidth = 4;
      g.strokeRect(42, 48, W - 84, H - 96);

      g.fillStyle = pageObj.accent;
      g.beginPath();
      g.roundRect(76, 92, 280, 44, 22);
      g.fill();

      g.fillStyle = "#ffffff";
      g.font = "bold 20px 'Microsoft YaHei', sans-serif";
      g.fillText(pageObj.tag, 98, 121);

      g.fillStyle = "#1f2329";
      g.font = "bold 40px 'Microsoft YaHei', sans-serif";
      const titleLines = pageObj.title.split("\n");
      titleLines.forEach((line, idx) => {
        g.fillText(line, 76, 215 + idx * 58);
      });

      g.strokeStyle = "rgba(0,0,0,0.1)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(76, 325);
      g.lineTo(W - 76, 325);
      g.stroke();

      g.fillStyle = "#334155";
      g.font = "25px 'Microsoft YaHei', sans-serif";
      pageObj.lines.forEach((line, idx) => {
        g.fillText(line, 76, 395 + idx * 74);
      });

      g.fillStyle = pageObj.accent;
      g.font = "bold 24px sans-serif";
      g.fillText(`PAGE 0${pageIndex + 1} / 05`, W - 230, H - 82);

      return c;
    }

    const pageCanvases = demoPages.map((p, i) => renderPageToCanvas(p, i));

    const stream = canvas.captureStream(30);
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 6000000
    });

    const chunks = [];
    recorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    return new Promise(resolve => {
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: mime }));
      };

      recorder.start();

      const HOLD_MS = 750;
      const FLIP_MS = 350;
      const SEGMENT_MS = HOLD_MS + FLIP_MS;
      const TOTAL_MS = demoPages.length * HOLD_MS + (demoPages.length - 1) * FLIP_MS;
      const startTime = performance.now();

      function tick() {
        const elapsed = performance.now() - startTime;
        if (elapsed >= TOTAL_MS) {
          ctx.drawImage(pageCanvases[pageCanvases.length - 1], 0, 0);
          recorder.stop();
          return;
        }

        const pageIdx = Math.min(
          demoPages.length - 1,
          Math.floor(elapsed / SEGMENT_MS)
        );
        const withinSeg = elapsed - pageIdx * SEGMENT_MS;

        if (withinSeg <= HOLD_MS || pageIdx === demoPages.length - 1) {
          ctx.drawImage(pageCanvases[pageIdx], 0, 0);
        } else {
          const progress = (withinSeg - HOLD_MS) / FLIP_MS;
          const curPage = pageCanvases[pageIdx];
          const nextPage = pageCanvases[pageIdx + 1];

          ctx.drawImage(nextPage, 0, 0);

          const splitX = Math.round(W * (1 - progress));
          if (splitX > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, splitX, H);
            ctx.clip();
            ctx.drawImage(curPage, 0, 0);
            ctx.restore();

            const foldWidth = Math.min(90, W - splitX);
            const grad = ctx.createLinearGradient(splitX - 30, 0, splitX + foldWidth, 0);
            grad.addColorStop(0, "rgba(0,0,0,0)");
            grad.addColorStop(0.4, "rgba(0,0,0,0.32)");
            grad.addColorStop(0.5, "#f1f5f9");
            grad.addColorStop(1, "rgba(0,0,0,0.18)");
            ctx.fillStyle = grad;
            ctx.fillRect(splitX - 30, 0, foldWidth + 40, H);
          }
        }

        requestAnimationFrame(tick);
      }

      requestAnimationFrame(tick);
    });
  }

  updateModeVisibility();
  updateParamLabels();
})();
