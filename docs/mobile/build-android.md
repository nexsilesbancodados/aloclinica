# Build app Android — AloClínica

Capacitor já está configurado. Apenas falta build + publicar.

## Pré-requisitos

- **Java JDK 17+** (https://adoptium.net)
- **Android Studio** (https://developer.android.com/studio) — só pra instalar SDK + Gradle
- **Conta Google Play Developer** ($25 único) — https://play.google.com/console

Tempo total: **1-2 horas** (primeira vez), depois minutos por release.

---

## Passo 1: Setup local

```bash
# Clone se ainda não tem
git clone https://github.com/nexsilesbancodados/aloclinica.git
cd aloclinica
npm install

# Build web
npm run build

# Sync Capacitor (gera/atualiza projeto Android)
npx cap sync android
```

## Passo 2: Configurar identificação do app

Edita `capacitor.config.ts`:

```typescript
const config: CapacitorConfig = {
  appId: 'br.com.aloclinica.app',  // ← muda pra teu reverse-domain
  appName: 'AloClínica',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    url: 'https://aloclinica.com.br',  // app abre direto o site
    cleartext: false,
  },
  android: {
    backgroundColor: '#1a6fc4',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#1a6fc4',
      androidSpinnerStyle: 'large',
      spinnerColor: '#ffffff',
    },
  },
};
```

## Passo 3: Adicionar ícones

1. Crie ícone **1024x1024** PNG (logo AloClínica)
2. Use https://easyappicon.com pra gerar todos tamanhos
3. Substitua em `android/app/src/main/res/mipmap-*/ic_launcher*.png`

Ou use ferramenta CLI:
```bash
npx @capacitor/assets generate --android
```

## Passo 4: Build APK debug (pra testar)

```bash
cd android
./gradlew assembleDebug
# Output: android/app/build/outputs/apk/debug/app-debug.apk
```

Instala no celular Android (USB debug ativado):
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

## Passo 5: Gerar keystore (assinatura)

**ÚNICA VEZ.** Anote a senha — sem ela você nunca mais consegue atualizar o app.

```bash
cd android/app
keytool -genkey -v -keystore aloclinica.keystore \
  -alias aloclinica -keyalg RSA -keysize 2048 -validity 10000
```

**Guardar o arquivo `aloclinica.keystore` em local seguro** (cofre, gerenciador de senhas com upload).

## Passo 6: Configurar gradle pra release

Cria `android/app/keystore.properties` (NÃO COMMITAR):
```properties
storeFile=aloclinica.keystore
storePassword=SUA_SENHA
keyAlias=aloclinica
keyPassword=SUA_SENHA
```

Adicionar `keystore.properties` no `.gitignore`.

Edita `android/app/build.gradle` (seção `signingConfigs`):
```gradle
signingConfigs {
    release {
        def keystoreProps = new Properties()
        keystoreProps.load(new FileInputStream(file("keystore.properties")))
        storeFile file(keystoreProps['storeFile'])
        storePassword keystoreProps['storePassword']
        keyAlias keystoreProps['keyAlias']
        keyPassword keystoreProps['keyPassword']
    }
}

buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled true
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
}
```

## Passo 7: Build release (AAB pra Play Store)

```bash
cd android
./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

## Passo 8: Publicar no Google Play

1. Login https://play.google.com/console
2. **Create app**: AloClínica
3. **App settings:**
   - Package name: `br.com.aloclinica.app`
   - Category: **Medical** (importante)
   - Tags: telemedicina, saúde, consulta
4. **Store listing:**
   - Name: AloClínica
   - Short description: Consultas médicas online 24h
   - Full description: ~3000 chars (pode usar texto da landing)
   - Icon: 512x512 PNG
   - Screenshots: 2-8 (1080x1920)
   - Feature graphic: 1024x500 PNG
5. **Content rating:** preencher questionário (geralmente Mature 17+ por ser saúde)
6. **Pricing:** Free
7. **Countries:** Brasil
8. **Privacy Policy URL:** https://aloclinica.com.br/privacy
9. **Production release:** upload `app-release.aab` → submit
10. Review do Google: **3-7 dias úteis** (primeira vez)

## Passo 9: Releases futuras

```bash
git pull
npm run build
npx cap sync android
cd android && ./gradlew bundleRelease
# upload novo AAB no Play Console
```

Importante: incrementar `versionCode` (inteiro) e `versionName` (string) em `android/app/build.gradle` a cada release:

```gradle
defaultConfig {
    versionCode 2  // sempre +1
    versionName "1.0.1"
}
```

---

## Troubleshooting

**Erro Java/Gradle:** verifica versão `java -version` (precisa 17+)

**Erro permissão keystore:** `chmod 600 android/app/keystore.properties`

**Erro upload Play:** geralmente proguard quebrou algo. Tente desabilitar `minifyEnabled false` pra testar.

**Camera não funciona:** Capacitor já tem permissão Android camera (`<uses-permission android:name="android.permission.CAMERA"/>`). Se não tiver, adicionar manualmente em `android/app/src/main/AndroidManifest.xml`.

---

## iOS (resumo)

Mesma lógica mas precisa:
- **Mac com Xcode** (Capacitor não compila iOS no Windows/Linux)
- **Apple Developer Program** ($99/ano)
- Build via Xcode: Archive → Submit
- Review Apple: 7-14 dias

Se não tiver Mac, opções:
- Alugar Mac em nuvem: https://www.macincloud.com ($30/mês)
- Usar serviço CI: GitHub Actions com macos-latest runner

---

## App como PWA (alternativa zero-custo)

Sistema **já é PWA** (vite-plugin-pwa configurado). Usuário pode "instalar" pelo navegador:

- **Android Chrome:** menu → "Adicionar à tela inicial"
- **iOS Safari:** botão Share → "Adicionar à Tela de Início"

Isso dá experiência ~80% similar a app nativo, **sem precisar publicar nas lojas**. Considere começar assim e depois publicar nas lojas quando tiver tração.
