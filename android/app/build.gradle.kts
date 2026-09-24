plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// 서명 키는 저장소에 넣지 않는다 (공개 저장소라 누구나 같은 서명으로 앱을 만들 수 있게 된다).
// 빌드할 때 환경변수로 넘긴다. 없으면 디버그 키로 서명된다 — 설치는 되지만,
// 다음 판을 다른 키로 만들면 '업데이트' 가 안 되고 지웠다 다시 깔아야 한다.
val ksFile = System.getenv("SITENOTE_KEYSTORE")?.let { file(it) }?.takeIf { it.exists() }

android {
    namespace = "com.jayunsu22.sitenote.widget"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.jayunsu22.sitenote.widget"
        minSdk = 26          // 안드로이드 8 이상 — java.time 을 그냥 쓸 수 있다
        targetSdk = 35
        versionCode = 6
        versionName = "1.5"
    }

    signingConfigs {
        if (ksFile != null) {
            create("release") {
                storeFile = ksFile
                storePassword = System.getenv("SITENOTE_KEYSTORE_PASS")
                keyAlias = System.getenv("SITENOTE_KEY_ALIAS") ?: "sitenote"
                keyPassword = System.getenv("SITENOTE_KEYSTORE_PASS")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (ksFile != null) signingConfigs.getByName("release")
                            else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    testOptions {
        unitTests.isIncludeAndroidResources = true   // Robolectric 으로 위젯을 실제로 그려 본다
        unitTests.all { t ->
            // 미리보기 그리기(WidgetPreview)에 쓰는 값들 — 환경변수로만 받는다
            listOf("RENDER_PREVIEW", "PREVIEW_JSON", "PREVIEW_OUT", "PREVIEW_TODAY", "PREVIEW_FONT", "PREVIEW_WEEK", "PREVIEW_DENSITY", "PREVIEW_BG", "PREVIEW_KIND")
                .forEach { k -> System.getenv(k)?.let { t.environment(k, it) } }
            System.getenv("ROBOLECTRIC_REPO")?.let { t.systemProperty("robolectric.dependency.repo.url", it) }
        }
    }
}

dependencies {
    implementation("androidx.work:work-runtime-ktx:2.9.1")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")          // 안드로이드 밖(JVM)에서 org.json 을 쓰려고
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation("androidx.test:core:1.6.1")
}
