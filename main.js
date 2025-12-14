// main.js
window.addEventListener("load", () => {
    // === HTML ELEMANLARINI AL ===
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

    // Güvenlik: eksik ID varsa hiç devam etme
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
        console.error("HTML içinde eksik ID'ler:", missing);
        alert("HTML içinde eksik ID'ler var: " + missing.join(", ") +
            "\nLütfen index.html dosyasını aynen kopyaladığından emin ol.");
        return;
    }

    // === GENEL DEĞİŞKENLER ===
    const TARGET_RADIUS_M = 5; // 5 m içinde 'Hedefe ulaştınız'
    let currentLat = null;
    let currentLon = null;
    let currentHeading = null;
    let selectedTarget = null;
    let watchId = null;

    // === KONUM NOKTALARI (HEM AR MODEL, HEM PUSULA) ===
    // Burayı kendi noktalarınla değiştirebilirsin.
    const PLACES = [
        {
            id: "text1",
            name: "Mühendislik Fakültesi",
            lat: 37.03808885295462,
            lon: 36.22507837283004,
            modelUrl: "./models/model1.glb",
            scale: "80 80 80",
        },
        {
            id: "text2",
            name: "İktisadi ve İdari Bilimler Fakültesi",
            lat: 37.03875939869471,
            lon: 36.224343444721995,
            modelUrl: "./models/model2.glb",
            scale: "80 80 80",
        },
        {
            id: "text3",
            name: "Mimarlık ve Güzel sanatlar Fakültesi",
            lat: 37.03872854616436,
            lon: 36.222965803653295,
            modelUrl: "./models/model3.glb",
            scale: "80 80 80",
        },
        {
            id: "text4",
            name: "Okü Kütüphane",
            lat: 37.03968843729149,
            lon: 36.2211674173243,
            modelUrl: "./models/model4.glb",
            scale: "80 80 80",
        },
        {
            id: "text5",
            name: "İlahiyat fakültesi",
            lat: 37.03859239709868,
            lon: 36.21980121739779,
            modelUrl: "./models/model5.glb",
            scale: "80 80 80",
        },
        {
            id: "text6",
            name: "Sağlık Bilimleri Fakültesi",
            lat: 37.04046931346141,
            lon: 36.22067415855654,
            modelUrl: "./models/model6.glb",
            scale: "80 80 80",
        },
        // Gerekirse buraya Text 3, Text 4 ekleyebilirsin
    ];

    // ============================
    // AR MODELLERİNİ SAHNEYE EKLE
    // ============================
    function addModels() {
        modelsContainer.innerHTML = "";
        PLACES.forEach((place) => {
            const ent = document.createElement("a-entity");
            ent.setAttribute("id", place.id);
            ent.setAttribute("gltf-model", place.modelUrl);
            ent.setAttribute("scale", place.scale);
            ent.setAttribute("gps-entity-place", `latitude: ${place.lat}; longitude: ${place.lon};`);
            ent.setAttribute("look-at", "[gps-camera]");

            const label = document.createElement("a-text");
            label.setAttribute("value", place.name);
            label.setAttribute("align", "center");
            label.setAttribute("position", "0 2 0");
            label.setAttribute("color", "#ffffff");
            label.setAttribute("width", "4");

            ent.appendChild(label);
            modelsContainer.appendChild(ent);
        });

        console.log("AR modeller sahneye eklendi:", PLACES.length);
    }

    // ============================
    // KONUM LİSTESİ (SOL ALT)
    // ============================
    function populateLocationList() {
        locationsListEl.innerHTML = "";
        PLACES.forEach((place, index) => {
            const btn = document.createElement("button");
            btn.className = "location-item";
            btn.textContent = place.name;
            btn.dataset.id = place.id;

            btn.addEventListener("click", () => {
                try {
                    selectedTarget = place;

                    document
                        .querySelectorAll(".location-item")
                        .forEach((b) => b.classList.remove("active"));
                    btn.classList.add("active");

                    currentTargetNameEl.textContent = `${place.name} (${place.lat.toFixed(6)}, ${place.lon.toFixed(6)})`;
                    statusEl.textContent = `Seçili hedef: ${place.name}`;

                    // Tıklama etkisini net görmek için değerleri hemen güncelle
                    checkTargetReached();
                    updateArrow();
                } catch (err) {
                    console.error("Konum seçerken hata:", err);
                }
            });

            locationsListEl.appendChild(btn);

            // İlk eleman default seçili olsun
            if (index === 0 && !selectedTarget) {
                selectedTarget = place;
                btn.classList.add("active");
                currentTargetNameEl.textContent = `${place.name} (${place.lat.toFixed(6)}, ${place.lon.toFixed(6)})`;
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

    // 0° = kuzey, saat yönünde artan açı
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

    function checkTargetReached() {
        if (currentLat == null || currentLon == null || !selectedTarget) {
            distanceEl.textContent = "–";
            targetMsgEl.style.display = "none";
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

    function updateArrow() {
        if (currentLat == null || currentLon == null || currentHeading == null || !selectedTarget) {
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

    // ============================
    // CİHAZ YÖNÜ (PUSULA)
    // ============================
    function startOrientation() {
        function handleOrientation(event) {
            let heading;

            // iOS için webkitCompassHeading (0 = gerçek kuzey)
            if (event.webkitCompassHeading != null) {
                heading = event.webkitCompassHeading;
            } else if (event.alpha != null) {
                // Diğer tarayıcılar: alpha 0 ≈ kuzey
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
            // iOS (izni kullanıcıdan al)
            DeviceOrientationEvent.requestPermission()
                .then((res) => {
                    if (res === "granted") {
                        window.addEventListener("deviceorientation", handleOrientation, true);
                        statusEl.textContent = "Pusula izni verildi. Hedeflere yönelebilirsiniz.";
                    } else {
                        statusEl.textContent = "Pusula izni reddedildi. Ok sabit kalacak.";
                    }
                })
                .catch((err) => {
                    console.error("Orientation permission hatası:", err);
                    statusEl.textContent = "Pusula izni alınırken hata oluştu.";
                });
        } else if (typeof DeviceOrientationEvent !== "undefined") {
            // Android vb.
            window.addEventListener("deviceorientation", handleOrientation, true);
            statusEl.textContent = "Pusula aktif. Hedeflere yönelebilirsiniz.";
        } else {
            statusEl.textContent = "Bu cihazda pusula (orientation) desteği yok.";
        }
    }

    // ============================
    // KONUM TAKİBİ (watchPosition)
    // ============================
    function startGeolocation() {
        if (!("geolocation" in navigator)) {
            alert("Bu cihaz konum servisini desteklemiyor.");
            hudStatusEl.textContent = "Konum yok";
            statusEl.textContent = "Konum yok";
            return;
        }

        hudStatusEl.textContent = "Konum izni bekleniyor...";
        statusEl.textContent = "Konum izni bekleniyor...";

        watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude, accuracy } = pos.coords;

                currentLat = latitude;
                currentLon = longitude;

                latEl.textContent = latitude.toFixed(6);
                lonEl.textContent = longitude.toFixed(6);
                coordEl.textContent = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
                accEl.textContent = accuracy ? accuracy.toFixed(1) : "-";

                hudStatusEl.textContent = "Takip ediliyor";
                if (!selectedTarget) {
                    statusEl.textContent = "Konum alınıyor. Bir hedef seçiniz.";
                } else {
                    statusEl.textContent = "Konum ve pusula aktif.";
                }

                checkTargetReached();
                updateArrow();
            },
            (err) => {
                console.error("Geolocation hatası:", err);
                hudStatusEl.textContent = "Konum hatası";
                statusEl.textContent = "Konum alınamadı: " + err.message;
                alert("Konum izni/verisi alınamadı: " + err.message);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 10000,
            }
        );
    }

    // ============================
    // AR + GEO + PUSULA BAŞLAT BUTONU
    // ============================
    startBtn.addEventListener("click", () => {
        startBtn.disabled = true;
        startBtn.textContent = "Başlatılıyor...";

        // AR modellerini sahneye ekle
        addModels();

        // Konum ve pusula takibini başlat
        startGeolocation();
        startOrientation();

        // Biraz sonra butonu sakla
        setTimeout(() => {
            startBtn.style.display = "none";
        }, 800);
    });

    // Sayfa açılınca listeyi hazırla
    populateLocationList();

    console.log("main.js yüklendi, PLACES:", PLACES);
});
