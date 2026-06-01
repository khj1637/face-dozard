/* =========================================================
   전생 관상 테스트 - 메인 로직
   ========================================================= */

/* ====== 교체 필요 항목 (모델 학습 완료 후) ======
   1) MODEL_URL_MALE   : 남자 Teachable Machine 모델 URL
   2) MODEL_URL_FEMALE : 여자 Teachable Machine 모델 URL
   3) KAKAO_JS_KEY     : 카카오 JavaScript 앱 키
   ================================================= */
const MODEL_URL_MALE   = "https://teachablemachine.withgoogle.com/models/REPLACE_MALE/";
const MODEL_URL_FEMALE = "https://teachablemachine.withgoogle.com/models/REPLACE_FEMALE/";
const KAKAO_JS_KEY     = "f2db92bfe1a4d586b07ec2eee4a05b9a";

/* ====== 카카오 SDK 초기화 ====== */
let kakaoReady = false;
try {
  if (window.Kakao && KAKAO_JS_KEY && !KAKAO_JS_KEY.startsWith("REPLACE")) {
    Kakao.init(KAKAO_JS_KEY);
    kakaoReady = true;
  }
} catch (e) { console.warn("Kakao init skipped:", e); }

/* ====== 상태 ====== */
let model = null;
let loadedGender = null;       // 현재 로드된 모델의 성별
let maxPredictions = 0;
let lastResult = null;         // 마지막 결과 {gender, key, data}

/* ====== DOM ====== */
const $ = (sel) => document.querySelector(sel);
const uploadCard   = $("#uploadCard");
const fileInput    = $("#fileInput");
const resultArea   = $("#resultArea");
const resultPhoto  = $("#resultPhoto");
const resultBody   = $("#resultBody");
const labelContainer = $("#labelContainer");
const loadingEl    = $("#loading");
const resultCard   = $("#resultCard");

/* ====== 성별 ====== */
function currentGender() {
  return document.querySelector('input[name="gender"]:checked').value; // 'male' | 'female'
}

/* ====== gtag 헬퍼 ====== */
function track(event, params) {
  if (typeof gtag === "function") gtag('event', event, params || {});
}

/* ====== 업로드 ====== */
function readURL(input) {
  if (!(input.files && input.files[0])) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    // UI 전환
    uploadCard.style.display = "none";
    resultArea.hidden = false;
    resultPhoto.src = e.target.result;
    loadingEl.style.display = "flex";
    resultBody.innerHTML = "";
    labelContainer.innerHTML = "";
    resultArea.scrollIntoView({ behavior: "smooth", block: "start" });

    track("test_start", { gender: currentGender() });

    initModel()
      .then(predict)
      .catch((err) => {
        console.error(err);
        loadingEl.style.display = "none";
        resultBody.innerHTML =
          '<div class="result-error">앗! 분석 중 문제가 생겼어요.<br>잠시 후 다시 시도해 주세요. 🙏</div>';
      });
  };
  reader.readAsDataURL(input.files[0]);
}
window.readURL = readURL; // inline onchange에서 호출

/* ====== 모델 로드 ====== */
async function initModel() {
  const gender = currentGender();
  if (model && loadedGender === gender) return; // 캐시 재사용

  const base = gender === "male" ? MODEL_URL_MALE : MODEL_URL_FEMALE;
  const modelURL = base + "model.json";
  const metadataURL = base + "metadata.json";

  model = await tmImage.load(modelURL, metadataURL);
  maxPredictions = model.getTotalClasses();
  loadedGender = gender;
}

/* ====== 예측 ====== */
async function predict() {
  const gender = currentGender();
  const prediction = await model.predict(resultPhoto, false);
  prediction.sort((a, b) => b.probability - a.probability);

  const topKey = prediction[0].className;
  const data = (RESULTS[gender] && RESULTS[gender][topKey]) || null;

  loadingEl.style.display = "none";

  if (!data) {
    resultBody.innerHTML =
      '<div class="result-error">결과를 찾을 수 없어요. 다른 사진으로 시도해 주세요!</div>';
    return;
  }

  lastResult = { gender, key: topKey, data };

  // 카드 테마 컬러
  resultCard.style.setProperty("--accent", data.color);

  // 결과 본문
  resultBody.innerHTML = `
    <div class="result-char-wrap">
      <img class="result-char" src="img/characters/${topKey}.svg"
           alt="${data.title}" loading="eager"
           onerror="this.style.display='none'">
      <div class="result-emoji">${data.emoji}</div>
    </div>
    <h2 class="result-title">${data.title}</h2>
    <p class="result-tagline">"${data.tagline}"</p>
    <p class="result-desc">${data.desc}</p>
    <div class="result-luck">${data.luck}</div>
  `;

  // 확률 바
  renderBars(prediction, gender);

  // 결과 등장 애니메이션
  requestAnimationFrame(() => resultCard.classList.add("revealed"));

  track("test_result", { gender, result: topKey });
}

/* ====== 확률 바 렌더 ====== */
function renderBars(prediction, gender) {
  // className -> probability 맵
  const probMap = {};
  prediction.forEach((p) => (probMap[p.className] = p.probability));

  const order = BAR_ORDER[gender] || Object.keys(probMap);
  let html = '<h3 class="bars-title">나의 관상 분석</h3>';

  order.forEach((key) => {
    const prob = probMap[key] || 0;
    const pct = Math.round(prob * 100);
    let width = pct;
    if (pct < 1) width = 2;
    else if (pct < 4) width = 4;
    const label = LABELS_KO[key] || key;
    html += `
      <div class="bar-row">
        <span class="bar-label">${label}</span>
        <div class="bar-track">
          <div class="bar-fill" style="width:0%" data-w="${width}%"></div>
        </div>
        <span class="bar-pct">${pct}%</span>
      </div>`;
  });

  labelContainer.innerHTML = html;

  // 바 애니메이션
  requestAnimationFrame(() => {
    labelContainer.querySelectorAll(".bar-fill").forEach((el, i) => {
      setTimeout(() => { el.style.width = el.dataset.w; }, 80 * i);
    });
  });
}

/* ====== 이미지 저장 ====== */
$("#saveImageBtn").addEventListener("click", async () => {
  track("share", { method: "image_save", result: lastResult?.key });
  try {
    showToast("이미지를 만드는 중...");

    // 외부 SVG <img>를 data URI로 인라인화 (html2canvas 안정화)
    const charImg = resultCard.querySelector(".result-char");
    let restore = null;
    if (charImg && charImg.src && !charImg.src.startsWith("data:")) {
      try {
        const res = await fetch(charImg.src);
        const svgText = await res.text();
        const dataUri = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText);
        restore = charImg.src;
        charImg.src = dataUri;
        await new Promise((r) => { charImg.onload = r; setTimeout(r, 400); });
      } catch (e) { /* 실패해도 캡처는 진행 */ }
    }

    const canvas = await html2canvas(resultCard, {
      backgroundColor: "#0F1E36",
      scale: 2,
      useCORS: true,
      logging: false
    });

    if (restore) charImg.src = restore;

    const link = document.createElement("a");
    link.download = `전생테스트_${lastResult?.data?.title || "결과"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    showToast("저장 완료! 📸");
  } catch (e) {
    console.error(e);
    showToast("저장에 실패했어요. 스크린샷으로 저장해 주세요!");
  }
});

/* ====== 카카오 공유 ====== */
$("#kakaoShareBtn").addEventListener("click", () => {
  track("share", { method: "kakao", result: lastResult?.key });

  if (!kakaoReady) {
    showToast("카카오 공유 준비 중이에요. 이미지 저장을 이용해 주세요!");
    return;
  }
  const data = lastResult?.data;
  Kakao.Share.sendDefault({
    objectType: "feed",
    content: {
      title: data ? `${data.emoji} ${data.title}` : "전생 관상 테스트",
      description: data ? data.tagline : "AI가 보는 나의 전생은? 지금 확인해보세요!",
      imageUrl: "https://face.dozard.com/img/og-image.jpg",
      link: {
        mobileWebUrl: "https://face.dozard.com",
        webUrl: "https://face.dozard.com"
      }
    },
    buttons: [
      {
        title: "나도 전생 테스트하기",
        link: {
          mobileWebUrl: "https://face.dozard.com",
          webUrl: "https://face.dozard.com"
        }
      }
    ]
  });
});

/* ====== 전면광고 모달 + 다시하기 ====== */
const adModal = $("#adModal");

function openAdModal() {
  adModal.hidden = false;
  document.body.style.overflow = "hidden";
  // 모달 내 광고 슬롯 푸시 (자동광고와 별개의 인아티클 단위)
  try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
  track("ad_modal_open", {});
}
function closeAdModal() {
  adModal.hidden = true;
  document.body.style.overflow = "";
}
function doRetry() {
  closeAdModal();
  // 상태 초기화
  resultArea.hidden = true;
  resultCard.classList.remove("revealed");
  uploadCard.style.display = "";
  fileInput.value = "";
  resultBody.innerHTML = "";
  labelContainer.innerHTML = "";
  lastResult = null;
  uploadCard.scrollIntoView({ behavior: "smooth", block: "center" });
  track("retry", {});
}

// 결과 화면의 "다시하기" → 광고 모달 먼저
$("#retryBtn").addEventListener("click", openAdModal);
$("#adModalClose").addEventListener("click", closeAdModal);
$("#modalRetryBtn").addEventListener("click", doRetry);
adModal.addEventListener("click", (e) => {
  if (e.target === adModal) closeAdModal();
});

/* ====== 드래그 앤 드롭 ====== */
["dragover", "dragenter"].forEach((ev) =>
  uploadCard.addEventListener(ev, (e) => {
    e.preventDefault();
    uploadCard.classList.add("dragging");
  })
);
["dragleave", "drop"].forEach((ev) =>
  uploadCard.addEventListener(ev, (e) => {
    e.preventDefault();
    uploadCard.classList.remove("dragging");
  })
);
uploadCard.addEventListener("drop", (e) => {
  const files = e.dataTransfer.files;
  if (files && files[0]) {
    fileInput.files = files;
    readURL(fileInput);
  }
});

/* ====== 성별 토글 슬라이더 위치 ====== */
function updateGenderSlider() {
  const isMale = currentGender() === "male";
  document.querySelector(".gender-toggle").classList.toggle("is-male", isMale);
}
document.querySelectorAll('input[name="gender"]').forEach((r) =>
  r.addEventListener("change", () => {
    updateGenderSlider();
    // 성별 바뀌면 모델 캐시 무효화
    model = null;
    loadedGender = null;
  })
);
updateGenderSlider();

/* ====== 토스트 ====== */
let toastTimer;
function showToast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => (t.hidden = true), 300);
  }, 2200);
}
