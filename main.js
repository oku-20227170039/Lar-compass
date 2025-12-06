// main.js
window.addEventListener("load", () => {
    // === HTML ELEMANLARI ===
    const startBtn = document.getElementById("startAR");
    const hudStatusEl = document.getElementById("hud-status");
    const latEl = document.getElementById("lat");
    const lonEl = document.getElementById("lon");
    const accEl = document.getElementById("acc");
    const modelsContainer = document.getElementById("modelsContainer");

    const locationsListEl = document.getElementById("locations-list");
    const targetMsgEl = document.getElementById("target-message");
    const statusEl = document.getElementById("status");
    const arrowEl = document.getElementById("arrow");

    const coordEl = document.getElementById("current-coord");
    const currentTargetNameEl = document.getElementById("current-target-name");
    const distanceEl = document.getElementById("distance");
    const headingEl = document.getElementById("heading");
    const bearingEl = document.getElementById("bearing");

    // Eksik eleman varsa uyar ve devam etme
    const required = [
        ["startAR", startBtn],
        ["hud-status", hudStatusEl],
        ["lat", latEl],
        ["lon", lonEl],
        ["acc", accEl],
        ["modelsContainer", modelsContainer],
        ["locations-list", locationsListEl],
        ["target-message", targetMsgEl],
        ["status", statusEl],
        ["arrow", arrowEl],
        ["current-coord", coordEl],
        ["current-target-name", currentTargetNameEl],
        ["distance", distanceEl],
        ["heading", headingEl],
        ["bearing", bearingEl],
    ];

    const missing = required.filter(([id, el]) => !el).map(([id]) => id);
    if (missing.length > 0) {
        console.error("HTML içinde eksik ID'ler var:", missing);
        alert("HTML içinde eksik ID'ler var: " + missing.join(", ") +
            "\nLütfen index.html dosyasını aynen kopyaladığından emin ol.");
        return;
    }

    // === SABİTLER ===
    const TARGET_RADIUS_M = 5; // 5 m içinde 'hedefe ulaştınız'

    // === KONUM NOKTALARI (Text 1 / Text 2) ===
    // Burayı kendi kampüs noktalarına göre değiştirebilirsin.
    const PLACES = [
        {
            id: "text1",
            name: "Text 1 (Hedef 1)",
            lat: 37.016818274423066,
            lon: 35.833630751074416,
            modelUrl: "./models/model1.glb",
            scale: "80 80 80",
        },
        {
            id: "text2",
            name: "Text 2 (Hedef 2)",
            lat: 37.0169,
            lon: 35.8339,
            modelUrl: "./models/model1.glb",
            scale: "80 80 80",
        },
    ];

    let currentLat = null;
    let currentLon = null;
    let currentHeading = null;
    let selectedTarget = null;
    let watchId = null;

    // ============================
    // AR MODELLERİNİ SAHNEYE EKLE
    // ============================
    function addModels() {
        modelsContainer.innerHTML = "";
        PLACES.forEach((place) => {
            const e = document.createElement("a-entity");
            e.setAttribute("id", place.id);
            e.setAttribute("gltf-model", place.modelUrl);
            e.setAttribute("scale", place.scale);
            e.setAttribute(
                "gps-entity-place",
                `latitude: ${place.lat}; longitude: ${place.lon};`
            );

            const text = document.createElement("a-text");
            text.setAttribute("value", place.name);
            text.setAttribute("align", "center");
            text.setAttribute("position", "0 2 0");
            text.setAttribute("color", "#ffffff");
            text.setAttribute("width", "4");

            e.appendChild(text);
            modelsContainer.appendChild(e);
        });

        console.log("Modeller sahneye eklendi:", PLACES.length);
    }

    // ============================
    // KONUM LİSTESİ
    // ============================
    function populateLocationList() {
        locationsListEl.innerHTML = "";
        PLACES.forEach((place, index) => {
            const btn = document.createElement("button");
            btn.className = "location-item";
            btn.textContent = place.name;
            btn.dataset.id = place.id;

            btn.addEventListener("click", () => {
                selectedTarget = place;
                document
                    .querySelectorAll(".location-item")
                    .forEach((b) => b.classList.remove("active"));
                btn.classList.add("active");

                currentTargetNameEl.textContent = place.name;
                console.log("Seçili hedef:", place.name);

                checkTargetReached();
                updateArrow();
            });

            locationsListEl.appendChild(btn);

            // İlk elemanı varsayılan seç
            if (index === 0 && !selectedTarget) {
                selectedTarget = place;
                btn.classList.add("active");
                currentTargetNameEl.textContent = place.name;
            }
        });
    }

    // ============================
    // MESAFE & AÇI HESAPLARI
    // ============================
    function getDistanceMeters(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const toRad = (deg) => (deg * Math.PI) / 180;

        const φ1 = toRad(lat1);
        const φ2 = toRad(lat2);
        const Δφ = toRad(lat2 - lat1);
        const Δλ = toRad(lon2 - lon1);

        const a =
            Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) *
            Math.cos(φ2) *
            Math.sin(Δλ / 2) *
            Math.sin(Δλ / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // 0° = kuzey, saat yönünde artıyor
    function getBearing(lat1, lon1, lat2, lon2) {
        const toRad = (deg) => (deg * Math.PI) / 180;
        const toDeg = (rad) => (rad * 180) / Math.PI;

        const φ1 = toRad(lat1);
        const φ2 = toRad(lat2);
        const Δλ = toRad(lon2 - lon1);

        const y = Math.sin(Δλ) * Math.cos(φ2);
        const x =
            Math.cos(φ1) * Math.sin(φ2) -
            Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

        let θ = Math.atan2(y, x);
        let brng = (toDeg(θ) + 360) % 360;
        return brng;
    }

    function updateArrow() {
        if (
            currentLat == null ||
            currentLon == null ||
            currentHeading == null ||
            !selectedTarget
        ) {
            return;
        }

        const bearing = getBearing(
            currentLat,
            currentLon,
            selectedTarget.lat,
            selectedTarget.lon
        );
        bearingEl.textContent = bearing.toFixed(1);

        // Okun dönmesi gereken açı: hedef açısı - cihazın baktığı açı
        let rotateDeg = bearing - currentHeading;
        rotateDeg = (rotateDeg + 360) % 360;

        arrowEl.style.transform = `rotate(${rotateDeg}deg)`;
    }

    function checkTargetReached() {
        if (
            currentLat == null ||
            currentLon == null ||
            !selectedTarget
        ) {
            return;
        }

        const d = getDistanceMeters(
            currentLat,
            currentLon,
            selectedTarget.lat,
            selectedTarget.lon
        );
        distanceEl.textContent = d.toFixed(2);

        if (d <= TARGET_RADIUS_M) {
            targetMsgEl.style.display = "block";
        } else {
            targetMsgEl.style.display = "none";
        }
    }

    // ============================
    // CİHAZ YÖNÜ (PUSULA)
    // ============================
    function startOrientation() {
        function handleOrientation(event) {
            let heading;

            // iOS
            if (event.webkitCompassHeading != null) {
                heading = event.webkitCompassHeading;
            } else if (event.alpha != null) {
                // Diğer tarayıcılar: alpha 0 genelde kuzey
                heading = 360 - event.alpha;
            }

            if (heading != null) {
                heading = (heading + 360) % 360;
                currentHeading = heading;
                headingEl.textContent = heading.toFixed(1);
                updateArrow();
            }
        }

        if (
            typeof DeviceOrientationEvent !== "undefined" &&
            typeof DeviceOrientationEvent.requestPermission === "function"
        ) {
            // iOS için izin
            DeviceOrientationEvent.requestPermission()
                .then((res) => {
                    if (res === "granted") {
                        window.addEventListener(
                            "deviceorientation",
                            handleOrientation,
                            true
                        );
                        statusEl.textContent =
                            "Pusula izni verildi. Hedefe yönlenebilirsiniz.";
                    } else {
                        statusEl.textContent =
                            "Pusula izni reddedildi. Ok sabit kalacak.";
                    }
                })
                .catch((err) => {
                    console.error("Orientation permission hatası:", err);
                    statusEl.textContent =
                        "Pusula izni alınırken hata oluştu.";
                });
        } else if (typeof DeviceOrientationEvent !== "undefined") {
            // Android vb.
            window.addEventListener(
                "deviceorientation",
                handleOrientation,
                true
            );
            statusEl.textContent =
                "Pusula aktif. Hedefe yönlenebilirsiniz.";
        } else {
            statusEl.textContent =
                "Bu cihazda pusula (DeviceOrientation) desteklenmiyor.";
        }
    }

    // ============================
    // AR + GEO BAŞLAT BUTONU
    // ============================
    startBtn.addEventListener("click", () => {
        startBtn.disabled = true;
        startBtn.textContent = "Başlatılıyor...";

        if (!("geolocation" in navigator)) {
            alert("Bu cihaz konum servisini desteklemiyor.");
            hudStatusEl.textContent = "Konum yok";
            statusEl.textContent = "Konum yok";
            return;
        }

        // AR modellerini ekle
        addModels();

        hudStatusEl.textContent = "Konum izni bekleniyor...";
        statusEl.textContent = "Konum izni bekleniyor...";

        // Sürekli konum takibi (AR.js de kendi içinde takip ediyor, bu ekstra)
        watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude, accuracy } = pos.coords;

                currentLat = latitude;
                currentLon = longitude;

                latEl.textContent = latitude.toFixed(6);
                lonEl.textContent = longitude.toFixed(6);
                coordEl.textContent =
                    latitude.toFixed(6) + ", " + longitude.toFixed(6);
                accEl.textContent = accuracy ? accuracy.toFixed(1) : "-";

                hudStatusEl.textContent = "Takip ediliyor";
                statusEl.textContent = "Konum ve pusula aktif.";

                checkTargetReached();
                updateArrow();
            },
            (err) => {
                console.error("geolocation hatası:", err);
                hudStatusEl.textContent = "Konum hatası";
                statusEl.textContent = "Konum alınamadı: " + err.message;
                alert(
                    "Konum izni/verisi alınamadı. Hata: " + err.message
                );
            },
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 10000,
            }
        );

        // Pusulayı başlat
        startOrientation();

        // Buton gizlensin
        setTimeout(() => {
            startBtn.style.display = "none";
        }, 500);
    });

    // Sayfa açılınca listeyi hazırla
    populateLocationList();

    console.log("main.js yüklendi.");
});
