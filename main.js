// main.js
window.addEventListener("load", () => {
    try {
        // === BUTON & HUD ===
        const startBtn = document.getElementById("startAR");

        const hudStatusEl = document.getElementById("hud-status");
        const latEl = document.getElementById("lat");
        const lonEl = document.getElementById("lon");
        const accEl = document.getElementById("acc");
        const modelsContainer = document.getElementById("modelsContainer");

        // === PUSULA & LİSTE TARAFI ===
        const statusEl = document.getElementById("status");
        const targetMsgEl = document.getElementById("target-message");
        const arrowEl = document.getElementById("arrow");
        const coordEl = document.getElementById("current-coord");
        const distanceEl = document.getElementById("distance");
        const headingEl = document.getElementById("heading");
        const bearingEl = document.getElementById("bearing");
        const currentTargetNameEl = document.getElementById("current-target-name");
        const locationsListEl = document.getElementById("locations-list");

        // Hangi ID bulunamamışsa hemen uyarı verelim:
        const required = [
            ["startAR", startBtn],
            ["hud-status", hudStatusEl],
            ["lat", latEl],
            ["lon", lonEl],
            ["acc", accEl],
            ["modelsContainer", modelsContainer],
            ["status", statusEl],
            ["target-message", targetMsgEl],
            ["arrow", arrowEl],
            ["current-coord", coordEl],
            ["distance", distanceEl],
            ["heading", headingEl],
            ["bearing", bearingEl],
            ["current-target-name", currentTargetNameEl],
            ["locations-list", locationsListEl],
        ];

        const missing = required.filter(([id, el]) => !el).map(([id]) => id);
        if (missing.length > 0) {
            console.error("HTML içinde eksik ID'ler var:", missing);
            alert("HTML içinde şu ID'ler eksik: " + missing.join(", ") +
                "\nSon gönderdiğim index.html dosyasını aynen kullan.");
            return; // Devam etmeyelim, yoksa yine hata alırsın
        }

        const TARGET_RADIUS_M = 5;

        // ============================
        // KAMPÜS NOKTALARI
        // ============================
        const PLACES = [
            {
                id: "text1",
                name: "Text 1",
                lat: 37.016818274423066,
                lon: 35.833630751074416,
                modelUrl: "./models/model1.glb",
                scale: "100 100 100",
            },
            {
                id: "text2",
                name: "Text 2",
                lat: 37.0169,
                lon: 35.8339,
                modelUrl: "./models/model1.glb",
                scale: "100 100 100",
            },
            // İstersen buraya Text 3, Text 4... ekle
        ];

        let arStarted = false;
        let currentLat = null;
        let currentLon = null;
        let currentHeading = null;
        let selectedTarget = null;

        // ============================
        // MODELLERİ SAHNEYE EKLE
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
            console.log("Modeller sahneye eklendi (PLACES uzunluğu):", PLACES.length);
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
                    console.log("Hedef değişti:", place.name);

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
        // Mesafe ve Bearing Hesapları
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

            let rotateDeg = bearing - currentHeading;
            rotateDeg = (rotateDeg + 360) % 360;

            arrowEl.style.transform = `rotate(${rotateDeg}deg)`;
        }

        function checkTargetReached() {
            if (
                currentLat == null ||
                currentLon == null ||
                !selectedTarget
            )
                return;

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

                if (event.webkitCompassHeading != null) {
                    heading = event.webkitCompassHeading; // iOS
                } else if (event.alpha != null) {
                    heading = 360 - event.alpha; // Diğer
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
                // iOS
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
                    "Bu cihazda pusula (orientation) desteklenmiyor.";
            }
        }

        // ============================
        // AR'I BAŞLAT BUTONU
        // ============================
        startBtn.addEventListener("click", () => {
            startBtn.style.display = "none";

            if (!("geolocation" in navigator)) {
                alert("Bu cihaz konum servisini desteklemiyor.");
                hudStatusEl.textContent = "Konum yok";
                statusEl.textContent = "Konum yok";
                return;
            }

            hudStatusEl.textContent = "Konum izni bekleniyor...";
            statusEl.textContent = "İzinler isteniyor...";

            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    hudStatusEl.textContent = "AR başlatılıyor...";
                    statusEl.textContent = "AR başlatılıyor...";

                    console.log(
                        "İlk konum:",
                        pos.coords.latitude,
                        pos.coords.longitude
                    );

                    addModels();
                    arStarted = true;
                    startOrientation();
                },
                (err) => {
                    hudStatusEl.textContent = "Konum izni reddedildi";
                    statusEl.textContent = "Konum izni reddedildi";
                    alert(
                        "Konum izni vermeden konum tabanlı AR + pusula çalışmaz."
                    );
                    console.error(err);
                },
                {
                    enableHighAccuracy: true,
                    maximumAge: 0,
                    timeout: 10000,
                }
            );
        });

        // ============================
        // GPS-CAMERA EVENTS (AR.js)
        // ============================
        const gpsCam = document.querySelector("[gps-camera]");
        if (!gpsCam) {
            console.error("gps-camera bulunamadı. A-Frame sahnesinde <a-camera gps-camera ...> var mı?");
            if (statusEl) {
                statusEl.textContent =
                    "gps-camera bulunamadı. index.html'deki <a-camera> etiketini kontrol et.";
            }
            return;
        }

        gpsCam.addEventListener("gps-camera-update-position", (e) => {
            const { position } = e.detail;
            if (!position) return;

            currentLat = position.latitude;
            currentLon = position.longitude;

            latEl.textContent = currentLat.toFixed(6);
            lonEl.textContent = currentLon.toFixed(6);
            coordEl.textContent = `${currentLat.toFixed(
                6
            )}, ${currentLon.toFixed(6)}`;
            accEl.textContent = position.accuracy
                ? position.accuracy.toFixed(1)
                : "-";

            if (!arStarted) {
                hudStatusEl.textContent = "AR hazır";
                statusEl.textContent =
                    "Konum ve pusula aktif. Bir hedef seçip ilerleyin.";
            } else {
                hudStatusEl.textContent = "Takip ediliyor";
                statusEl.textContent =
                    "Takip ediliyor, seçili hedefe yönlenin.";
            }

            checkTargetReached();
            updateArrow();
        });

        gpsCam.addEventListener("gps-camera-error", (e) => {
            console.warn("gps-camera error:", e.detail);
            hudStatusEl.textContent = "gps-camera hatası";
            statusEl.textContent = "gps-camera hatası";
        });

        // Sayfa açılır açılmaz listeyi hazırla
        populateLocationList();

        console.log("main.js başarıyla yüklendi.");
    } catch (err) {
        console.error("main.js genel hata:", err);
        alert(
            "main.js içinde bir hata oluştu, detaylar için konsola bak (F12 > Console)."
        );
    }
});
