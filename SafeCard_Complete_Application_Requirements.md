# Emergency Information Card — Complete Application Requirements

## 1. Project Overview

**Project name:** Emergency Information Card (working name: **SafeCard**)

Emergency Information Card is a privacy-focused application that allows a person to create a digital emergency information card containing important personal and emergency details.

The user can:

- Create one or more emergency information cards.
- Store cards locally on the device.
- Protect the application with a password, PIN, and/or fingerprint/Face ID where supported.
- Generate a QR code for a selected card.
- Set a separate short password/passcode for the QR share.
- Share the QR code with another person.
- Let another person scan the QR code using the same application.
- Require the QR-share password before sensitive information is displayed.
- Work on mobile phones and laptops/desktops.
- Prefer local/offline operation and avoid storing personal information on a server by default.

### Core idea

A person creates an emergency card such as:

> "If something happens to me, this information may help a first responder, hospital, police officer, friend, or family member."

The card can contain only the information the owner chooses to share.

---

# 2. Main Goals

## Primary goals

1. Make emergency information available quickly.
2. Keep sensitive information private.
3. Allow offline creation and viewing.
4. Make QR sharing simple.
5. Require authentication before opening the application.
6. Require a separate share password before revealing a shared card.
7. Support mobile and desktop/laptop.
8. Provide a very simple user interface.
9. Minimize collection of user data.
10. Make the application usable by non-technical people.

## Secondary goals

- Support multiple cards.
- Allow users to update and regenerate QR codes.
- Allow selective sharing.
- Provide a clear emergency mode.
- Provide multilingual support in the future.
- Provide accessibility features.

---

# 3. Important Security Design Decision

A QR code is not private by itself.

Anyone who obtains a QR image can potentially copy it. Therefore, the application should **not put readable personal information directly into the QR code**.

### Recommended design

The QR code should contain an **encrypted emergency-card payload**.

Conceptually:

```text
User information
       ↓
Create emergency card
       ↓
Serialize selected information
       ↓
Encrypt using a key derived from QR share password
       ↓
Generate QR payload
       ↓
Generate QR image
```

When another person scans:

```text
Scan QR
   ↓
Read encrypted payload
   ↓
Ask for share password
   ↓
Derive decryption key
   ↓
Decrypt
   ↓
Validate card
   ↓
Display emergency information
```

This allows the application to work offline and prevents a normal QR scanner from immediately seeing the personal information.

---

# 4. Two Different Security Layers

The application should have two separate protections.

## Layer 1 — Application Lock

Protects the owner's cards stored inside the application.

Possible methods:

- PIN
- Password
- Fingerprint
- Face authentication
- Device biometric authentication

Example:

```text
Open SafeCard
      ↓
Fingerprint
      ↓
Home screen
```

If biometric authentication is unavailable:

```text
Enter PIN
```

## Layer 2 — QR Share Password

This protects information shared through a QR code.

Example:

```text
Create QR
    ↓
Set share password
    ↓
Confirm password
    ↓
Generate encrypted QR
```

A person scanning the QR must know the share password.

### Important

The application password and QR share password should be independent.

For example:

```text
Application PIN:
4829

QR Share Password:
7264
```

Do not automatically use the application PIN as the QR password.

---

# 5. Target Platforms

The application should run on:

- Android
- iOS
- Windows
- macOS
- Linux, if practical

## Recommended technology

### Frontend / application

**Flutter + Dart**

Reason:

- One codebase.
- Android support.
- iOS support.
- Windows support.
- macOS support.
- Good QR libraries.
- Good local-storage support.
- Good biometric integration.
- Good responsive UI.

Alternative:

- React Native for mobile + separate desktop/web solution.
- .NET MAUI.
- Kotlin Multiplatform.

For a beginner-friendly single-codebase project, **Flutter is recommended**.

---

# 6. Application Architecture

Recommended architecture:

```text
┌─────────────────────────────────────┐
│             UI Layer                │
│ Flutter Screens / Widgets           │
└──────────────────┬──────────────────┘
                   │
┌──────────────────▼──────────────────┐
│          Application Layer          │
│ Card Service                        │
│ QR Service                          │
│ Authentication Service              │
│ Encryption Service                  │
│ Sharing Service                      │
└──────────────────┬──────────────────┘
                   │
┌──────────────────▼──────────────────┐
│             Data Layer              │
│ Local Database                      │
│ Secure Storage                      │
│ File Storage                         │
└─────────────────────────────────────┘
```

No backend is required for the first version.

---

# 7. Local-Only Architecture

The first version should be **local-first**.

The user's personal information should remain on their device.

Possible storage:

### Normal application data

Use:

- SQLite
- Hive
- Isar
- Drift

Recommended for structured data:

**Drift/SQLite** or **Isar**

### Secrets

Never store:

- plain application passwords
- plain PINs
- encryption keys in ordinary database fields

Use platform secure storage:

- Android Keystore
- iOS Keychain
- Windows Credential Manager / protected storage
- macOS Keychain

Flutter packages can provide a cross-platform abstraction.

---

# 8. Emergency Card Data

The user should decide what information is included.

## Personal details

- Full name
- Preferred name
- Date of birth
- Photo (optional)
- Gender/sex, optional
- Nationality, optional

## Emergency contacts

For each contact:

- Name
- Relationship
- Phone number
- Secondary phone number
- Email, optional

Example:

```text
Emergency Contact 1
Name: Ravi Kumar
Relationship: Brother
Phone: +91 XXXXX XXXXX
```

## Medical information

This section must be clearly optional.

Possible fields:

- Blood group
- Allergies
- Important medical conditions
- Current medications
- Medical notes
- Organ donor status, optional
- Doctor name/contact, optional

The app should display a warning that users should keep information accurate and should not rely on the application as a substitute for professional medical records.

## Identification

Optional:

- Government ID type
- ID number

**Recommendation:** Do not encourage users to put full government identification numbers into a QR by default.

If supported, the user should explicitly enable sensitive fields.

## Other useful emergency information

- Preferred hospital
- Insurance provider
- Insurance policy reference
- Important instructions
- Language
- Emergency notes

---

# 9. Privacy Levels

Instead of forcing users to share everything, provide sharing levels.

## Level 1 — Basic

Example:

```text
Name
Photo
Emergency contacts
Blood group
Allergies
```

## Level 2 — Medical

Example:

```text
Name
Blood group
Allergies
Medications
Medical conditions
Emergency contacts
```

## Level 3 — Custom

The user selects individual fields.

Example:

```text
☑ Name
☑ Blood group
☑ Allergy
☐ Address
☑ Emergency contact
☐ Government ID
```

This is an important privacy feature.

---

# 10. Main Screens

## 10.1 Splash Screen

```text
        SafeCard

Emergency information,
available when it matters.
```

Then:

- first launch → setup
- returning user → authentication

---

# 11. First-Time Setup

First launch:

```text
Welcome to SafeCard

Create a secure emergency
information card.

[ Create My Card ]
```

Then:

```text
Secure your application

Create PIN
[      ]

Confirm PIN
[      ]

[ Continue ]
```

Then:

```text
Enable biometric unlock?

Fingerprint / Face ID

[ Enable ]
[ Skip ]
```

---

# 12. Home Screen

Recommended layout:

```text
┌───────────────────────────────┐
│ SafeCard                 ⚙️   │
├───────────────────────────────┤
│                               │
│       Your Emergency Card     │
│                               │
│       👤 Vadayar              │
│       🩸 O+                   │
│       ⚠️ Allergy: ...         │
│                               │
│ [ View Card ]                 │
│ [ Share QR ]                  │
│                               │
├───────────────────────────────┤
│ My Cards                      │
│                               │
│ Personal Emergency Card       │
│ Family Member Card            │
│                               │
│ [+ Create Card]               │
└───────────────────────────────┘
```

---

# 13. Create Card Flow

## Step 1

```text
Create Emergency Card

Card name:
[ My Emergency Card ]

[ Continue ]
```

## Step 2 — Personal Information

```text
Full name
Date of birth
Photo
```

## Step 3 — Emergency Contacts

```text
Emergency Contacts

[ + Add Contact ]

Mother
+91 XXXXX XXXXX

Brother
+91 XXXXX XXXXX
```

## Step 4 — Medical Information

```text
Blood Group
[ O+ ]

Allergies
[ Penicillin ]

Medical Conditions
[ ... ]

Medications
[ ... ]
```

## Step 5 — Additional Information

```text
Preferred Hospital
Insurance
Emergency Notes
```

## Step 6 — Review

Show exactly what will be stored.

```text
Review Card

Personal
✓ Name
✓ Date of birth

Medical
✓ Blood group
✓ Allergy

Contacts
✓ Mother
✓ Brother

[ Save Card ]
```

---

# 14. View Card

The card should look like a physical emergency card.

```text
┌───────────────────────────────┐
│       EMERGENCY CARD          │
│                               │
│          [PHOTO]              │
│                               │
│ Vadayar                       │
│                               │
│ Blood Group: O+               │
│                               │
│ ⚠ Allergy                     │
│ Penicillin                    │
│                               │
│ Emergency Contact             │
│ Brother                       │
│ +91 XXXXX XXXXX               │
│                               │
│ Medical Notes                 │
│ ...                           │
└───────────────────────────────┘
```

Buttons:

```text
[ Edit ]
[ Generate QR ]
[ Share ]
```

---

# 15. QR Generation

When the user selects:

```text
Generate QR
```

Show:

```text
What information should be shared?

☑ Name
☑ Photo
☑ Blood group
☑ Allergies
☑ Emergency contact
☐ Address
☐ Government ID

[ Continue ]
```

Then:

```text
Create QR Password

Password:
[ ______ ]

Confirm:
[ ______ ]

Password should be easy enough
for the intended recipient to enter
but not obvious to others.

[ Generate QR ]
```

Then encrypt the selected information and create QR.

---

# 16. QR Screen

```text
       EMERGENCY CARD

        ███████████
        ██ QR CODE ██
        ███████████

QR created:
25 Aug 2026

Shared fields:
Name
Blood group
Allergy
Emergency contact

[ Save QR Image ]
[ Share QR ]
[ Print ]
```

---

# 17. QR Scanning

Home screen should have:

```text
[ Scan Emergency QR ]
```

Camera opens.

After scanning:

```text
Emergency Card Found

This card is password protected.

Enter QR password:

[ ______ ]

[ Unlock ]
```

If correct:

```text
✓ Card Unlocked

EMERGENCY INFORMATION

Name
Vadayar

Blood Group
O+

Allergy
Penicillin

Emergency Contact
Brother
+91 XXXXX XXXXX

[ Call Contact ]
```

---

# 18. Wrong Password Handling

Do not reveal which part of the password was wrong.

Show:

```text
Unable to unlock this card.

Please check the QR share password.
```

Possible protection:

- Rate limit attempts.
- Temporary delay after repeated failures.
- Do not permanently lock the emergency QR because a legitimate emergency user might need access.

The owner can choose stronger protection if desired.

---

# 19. QR Expiration

Add an optional QR expiration feature.

When creating a QR:

```text
QR Expiration

○ Never
○ 1 hour
○ 24 hours
○ 7 days
○ Custom
```

This is useful for temporary sharing.

However, expiration only works reliably when the app can verify time and/or a server is involved. For a fully offline QR, expiration is best treated as a local/display rule and should not be presented as strong revocation.

---

# 20. QR Versioning

Every generated QR should have an internal identifier/version.

Example:

```text
Card ID:
SC-7F91A2

QR Version:
3
```

When the card changes:

```text
Old QR → Version 2
New QR → Version 3
```

The app can warn:

```text
Your card has changed.

Your previously generated QR may contain
old information.

Generate a new QR?
```

---

# 21. Offline Requirement

The most important public-use feature is offline access.

The application should work without internet for:

- Creating cards
- Viewing cards
- Editing cards
- Generating QR
- Scanning QR
- Decrypting QR
- Viewing emergency information

Internet should not be required for the core emergency workflow.

---

# 22. Calling Emergency Contacts

After scanning a card, phone users can have buttons:

```text
☎ Call
✉ Message
```

For example:

```text
Emergency Contact

Brother
+91 XXXXX XXXXX

[ Call ]
[ Message ]
```

The application should request the appropriate OS permission only when needed.

---

# 23. Emergency Mode

Add a very simple emergency mode.

Possible entry:

```text
🚨 Emergency Mode
```

This can display:

```text
EMERGENCY INFORMATION

Name
Blood Group
Allergies
Emergency Contacts

[ CALL CONTACT ]
```

Keep this screen high contrast and easy to read.

---

# 24. Accessibility

The application should support:

- Large text
- High contrast
- Screen readers
- Large buttons
- Simple language
- No critical information conveyed only through color
- Clear icons + text
- Optional dark mode
- Keyboard navigation on desktop
- Touch-friendly controls

---

# 25. Multi-Card Support

Allow users to create multiple cards.

Examples:

```text
My Emergency Card
Child Emergency Card
Parent Emergency Card
Pet Emergency Card
Travel Emergency Card
```

For the first MVP, one card is enough.

Multiple cards can be added later.

---

# 26. Card Templates

Possible templates:

### Personal

Basic emergency information.

### Child

Parent/guardian contacts and medical information.

### Senior

Medical information, medications, emergency contacts.

### Travel

Emergency contacts, insurance, passport-related notes.

### Pet

Pet name, owner, veterinarian, allergies, medications.

Templates should only pre-select fields; users must remain in control of what is stored/shared.

---

# 27. Security Requirements

## Password storage

Never store passwords as plain text.

Use:

- Strong password hashing for application authentication.
- Salted password-derived keys where encryption is required.
- Platform secure storage for device secrets.

## QR encryption

Use a modern authenticated encryption algorithm such as:

**AES-256-GCM**

or another well-reviewed authenticated encryption construction supported by the selected platform/library.

The QR payload should contain metadata needed for decryption, such as:

```text
format version
algorithm identifier
salt
nonce/IV
ciphertext
authentication tag
card version
```

Do not hard-code one encryption key into the application.

---

# 28. QR Password Key Derivation

The QR password should not directly be used as the AES key.

Use a password-based key derivation function such as:

- Argon2id
- scrypt
- PBKDF2 where platform/library constraints require it

Conceptually:

```text
QR Password
     +
Random Salt
     ↓
Key Derivation Function
     ↓
Encryption Key
     ↓
AES-GCM
     ↓
Encrypted QR payload
```

Each QR should use a fresh random salt and nonce.

---

# 29. QR Payload Format

A versioned JSON structure can be used before encryption.

Example:

```json
{
  "version": 1,
  "cardId": "random-id",
  "qrVersion": 1,
  "createdAt": "2026-08-25T10:30:00Z",
  "expiresAt": null,
  "fields": {
    "name": "Example Person",
    "bloodGroup": "O+",
    "allergies": ["Example allergy"],
    "emergencyContacts": [
      {
        "name": "Example Contact",
        "relationship": "Brother",
        "phone": "+91XXXXXXXXXX"
      }
    ]
  }
}
```

This JSON should be encrypted before being placed in the QR.

---

# 30. QR Size Consideration

A QR code has limited capacity.

Do not attempt to place:

- Large photos
- Long medical histories
- Large documents
- Videos
- Excessive text

inside the QR.

For photos, the recommended MVP approach is:

**Do not include the photo in the QR initially.**

Instead, either:

1. Use a simple avatar/initials, or
2. Include a small compressed image only if testing shows the QR remains reliably scannable.

For large data, a future online version can use an encrypted server reference.

---

# 31. Local Database Model

Suggested tables/entities:

## UserSettings

```text
id
authEnabled
biometricEnabled
createdAt
updatedAt
```

## EmergencyCard

```text
id
title
fullName
dateOfBirth
photoPath
bloodGroup
allergies
medicalConditions
medications
preferredHospital
insuranceInfo
notes
createdAt
updatedAt
```

## EmergencyContact

```text
id
cardId
name
relationship
phone
secondaryPhone
email
```

## QRShare

```text
id
cardId
qrVersion
createdAt
expiresAt
sharedFields
payload
```

The actual QR password should not be stored in plain text.

---

# 32. Recommended Project Structure

For Flutter:

```text
lib/
├── main.dart
│
├── core/
│   ├── constants/
│   ├── errors/
│   ├── security/
│   ├── utils/
│   └── theme/
│
├── data/
│   ├── database/
│   ├── models/
│   ├── repositories/
│   └── storage/
│
├── features/
│   ├── onboarding/
│   ├── authentication/
│   ├── home/
│   ├── emergency_card/
│   ├── qr_generation/
│   ├── qr_scanner/
│   ├── settings/
│   └── emergency_mode/
│
└── shared/
    ├── widgets/
    └── components/
```

---

# 33. Recommended Packages / Capabilities

The exact packages should be selected and reviewed at implementation time.

Likely capabilities:

- QR generation
- QR/barcode scanning
- Local database
- Secure storage
- Biometric authentication
- Camera
- File/image handling
- Phone launching
- Sharing
- PDF/printing if later required

Choose actively maintained packages with strong platform support.

---

# 34. MVP — Build This First

Do not build the entire vision immediately.

### MVP features

- [ ] Flutter project
- [ ] First-launch setup
- [ ] Application PIN
- [ ] Biometric unlock
- [ ] Create one emergency card
- [ ] Edit card
- [ ] Save card locally
- [ ] View card
- [ ] Select fields to share
- [ ] Set QR password
- [ ] Encrypt QR payload
- [ ] Generate QR
- [ ] Scan QR
- [ ] Ask for QR password
- [ ] Decrypt QR
- [ ] Display shared card
- [ ] Call emergency contact
- [ ] Basic privacy/security settings

This is already a strong project.

---

# 35. Version 2

After the MVP works:

- [ ] Multiple cards
- [ ] Card templates
- [ ] QR expiration
- [ ] QR version management
- [ ] Save/share QR image
- [ ] Print card
- [ ] Emergency mode
- [ ] Dark mode
- [ ] Accessibility improvements
- [ ] Multilingual UI
- [ ] Export/import encrypted backup
- [ ] Card deletion with confirmation
- [ ] Automatic backup reminder

---

# 36. Version 3

Advanced features:

- [ ] Optional cloud backup
- [ ] Encrypted account synchronization
- [ ] Family card management
- [ ] Web emergency viewer
- [ ] Temporary QR
- [ ] Revocation
- [ ] Organization/hospital integration
- [ ] Emergency location sharing
- [ ] Medical document attachments
- [ ] Audit/history
- [ ] Trusted emergency contacts

These should come only after the local-first version is secure and stable.

---

# 37. Cloud Design — Future Only

A server is **not necessary for MVP**.

If cloud synchronization is added later:

```text
Mobile/Desktop
      ↓
Encrypted data
      ↓
Cloud storage
      ↓
Other user's devices
```

The server should ideally store encrypted data and should not have access to plaintext sensitive information.

Do not add a cloud database simply because it is common in app development.

---

# 38. UX Principles

## Principle 1 — Emergency first

A person under stress should not have to navigate many screens.

Bad:

```text
Home
 → Menu
 → Cards
 → Card
 → Medical
 → Contacts
```

Better:

```text
Home
 → Emergency Card
```

## Principle 2 — Very few words

Use:

```text
Scan QR
Unlock
Call
Share
Edit
```

instead of long explanations.

## Principle 3 — Make dangerous actions obvious

Deleting a card:

```text
Delete Emergency Card?

This cannot be undone.

[ Cancel ] [ Delete ]
```

## Principle 4 — Show sharing scope

Before generating QR:

```text
You are sharing:

✓ Name
✓ Blood group
✓ Allergy
✓ Emergency contact

Not shared:

✗ Address
✗ Government ID
✗ Insurance

[ Generate QR ]
```

This is an important trust feature.

---

# 39. First-Time User Experience

Ideal flow:

```text
Install
  ↓
Welcome
  ↓
Create PIN
  ↓
Enable fingerprint
  ↓
Create emergency card
  ↓
Add emergency contact
  ↓
Choose information
  ↓
Save
  ↓
Home
  ↓
Generate QR
  ↓
Set QR password
  ↓
QR ready
```

Target:

**A user should be able to create their first card in approximately 2–5 minutes.**

---

# 40. Error Handling

Every failure should have a simple explanation.

### Camera permission

```text
Camera permission is required
to scan an emergency QR.

[ Allow Camera ]
```

### Invalid QR

```text
This does not appear to be
a SafeCard QR code.
```

### Corrupted QR

```text
The QR code could not be read.
Please scan again.
```

### Wrong password

```text
The QR password is incorrect.
```

### Expired QR

```text
This QR code has expired.
Ask the card owner for a new QR.
```

---

# 41. Privacy Policy Requirements

The application should clearly explain:

- What data is stored.
- Where it is stored.
- Whether data leaves the device.
- Whether analytics are collected.
- Whether crash reports are collected.
- How deletion works.
- What QR sharing means.
- That anyone with the QR and password can view the shared information.

For the local-only MVP, the privacy message can be simple:

```text
Your emergency card is stored on this device.

SafeCard does not require an account
and does not upload your card to a server
for the core offline features.
```

Only make this claim if the implementation actually follows it.

---

# 42. Important Legal/Safety Considerations

The app should not claim:

- It guarantees emergency response.
- Hospitals officially accept the card.
- Information is medically verified.
- Emergency services can automatically access it.
- A QR code is impossible to copy.

Include a disclaimer:

```text
Emergency information is provided by the card owner.
Always verify critical information when possible.

SafeCard is an information-sharing tool and does not
replace official medical records or emergency services.
```

---

# 43. Threat Model

Consider these scenarios:

### Scenario A — Someone photographs the QR

Protection:

- QR contains encrypted information.
- Password is required.

### Scenario B — Someone gets the phone

Protection:

- Application PIN/biometric lock.
- Secure storage.
- Database encryption if appropriate.

### Scenario C — Someone guesses QR password

Protection:

- Encourage a sufficiently strong password.
- Rate limit attempts in the scanner.
- Do not use predictable defaults.

### Scenario D — User loses phone

MVP:

- Data remains on that device.
- No cloud backup unless explicitly added.

Future:

- Encrypted backup/recovery.

### Scenario E — Old QR is shared

Protection:

- QR versioning.
- Expiration options.
- Clear warning when card information changes.

---

# 44. Backup and Recovery

For the first version:

```text
Settings
  ↓
Backup
  ↓
Export encrypted backup
```

The exported backup should itself be encrypted.

Possible future options:

- Encrypted file
- Password-protected backup
- iCloud/Google Drive encrypted backup
- Optional cloud synchronization

Never create an unencrypted export containing all personal information.

---

# 45. Desktop/Laptop UX

The desktop version should not simply stretch the mobile UI.

Use a responsive layout:

```text
┌──────────────┬──────────────────────────┐
│ Home         │                          │
│ My Cards     │     Emergency Card       │
│ Scan QR      │                          │
│ Settings     │     [Card Information]   │
│              │                          │
└──────────────┴──────────────────────────┘
```

Desktop advantages:

- Larger card preview.
- Drag/drop image.
- Keyboard navigation.
- Print support.
- Larger QR display.

---

# 46. Mobile UX

Mobile should prioritize:

- One-handed use.
- Large buttons.
- Camera scanning.
- Quick contact calling.
- Offline operation.
- Biometric unlock.

Primary actions should be at the bottom or easily reachable.

---

# 47. Testing Requirements

## Unit tests

Test:

- Card validation.
- Password validation.
- Encryption/decryption.
- QR payload serialization.
- QR versioning.
- Expiration logic.

## Widget/UI tests

Test:

- Create card.
- Edit card.
- Save card.
- Generate QR.
- Scan QR.
- Enter password.
- Display shared card.

## Security tests

Test:

- Wrong password.
- Modified QR payload.
- Corrupted ciphertext.
- Empty fields.
- Extremely long fields.
- Repeated password attempts.
- Deleted card.
- Old QR.

## Device testing

Test on:

- Android
- iPhone
- Windows
- macOS, if supported

---

# 48. Performance Requirements

The application should:

- Open quickly.
- Work offline.
- Generate a QR quickly.
- Scan a QR quickly.
- Avoid unnecessary animations.
- Avoid storing large images.
- Avoid network calls for core functions.

---

# 49. Accessibility & Public Usability Checklist

- [ ] Large readable fonts
- [ ] High contrast
- [ ] Screen-reader labels
- [ ] Large touch targets
- [ ] Keyboard support on desktop
- [ ] No critical information represented only by color
- [ ] Simple English
- [ ] Error messages are understandable
- [ ] Support multiple languages in future
- [ ] Emergency information visible quickly

---

# 50. Recommended Development Roadmap

## Phase 1 — UI Prototype

Build:

- Splash
- Onboarding
- PIN screen
- Home
- Create card
- View card
- QR screen
- Scanner screen
- Settings

No real encryption initially; use mock data only for UI development.

## Phase 2 — Local Storage

Add:

- Local database
- Card CRUD
- Contacts
- Secure settings

## Phase 3 — Security

Add:

- Password/PIN authentication
- Secure storage
- Biometric authentication
- Database protection as appropriate

## Phase 4 — QR

Add:

- Card serialization
- Encryption
- Password-derived encryption key
- QR generation
- QR scanning
- Decryption

## Phase 5 — Emergency Features

Add:

- Call contact
- Emergency mode
- Quick display
- Expiration/version handling

## Phase 6 — Testing

Perform:

- Unit tests
- UI tests
- Security tests
- Offline tests
- Device tests

## Phase 7 — Polish

Add:

- Accessibility
- Dark mode
- Better animations
- Multilingual support
- Better onboarding

---

# 51. Suggested Technology Stack

## Application

```text
Flutter
Dart
```

## Local database

Choose one:

```text
Drift + SQLite
```

or

```text
Isar
```

## Secure storage

Use platform secure storage through a well-maintained Flutter package.

## Authentication

Use:

- Local PIN/password authentication.
- Platform biometric APIs.

## QR

Use a maintained QR generation/scanning library.

## Encryption

Use a well-reviewed cryptography library supporting:

- AES-GCM
- Argon2id/scrypt/PBKDF2 as appropriate
- Secure random generation

## Backend

```text
None for MVP
```

---

# 52. Example Complete User Journey

### Owner

```text
Open App
   ↓
Fingerprint
   ↓
Home
   ↓
Create Emergency Card
   ↓
Enter information
   ↓
Save
   ↓
Generate QR
   ↓
Choose fields
   ↓
Set QR password: 7391
   ↓
Encrypted QR generated
   ↓
Show QR to trusted person
```

### Recipient

```text
Open SafeCard
   ↓
Scan QR
   ↓
Encrypted data detected
   ↓
Enter QR password
   ↓
7391
   ↓
Information decrypted
   ↓
Emergency Card displayed
   ↓
Tap Call
```

---

# 53. Example Emergency Card

```text
╔══════════════════════════════╗
║      EMERGENCY CARD          ║
║                              ║
║          VADAYAR             ║
║                              ║
║ Blood Group: O+              ║
║                              ║
║ ⚠ ALLERGY                   ║
║ Penicillin                   ║
║                              ║
║ Emergency Contact            ║
║ Brother                      ║
║ +91 XXXXX XXXXX              ║
║                              ║
║ Medical Condition            ║
║ Example                      ║
╚══════════════════════════════╝
```

---

# 54. What NOT to Build in the First Version

Avoid these initially:

- Social networking.
- Chat.
- Public user profiles.
- Advertising.
- Complex cloud infrastructure.
- Automatic location tracking.
- Government database integration.
- Hospital database integration.
- Large document storage.
- AI chatbot.
- Payments.
- User accounts.

These increase complexity, privacy risk, and development time.

---

# 55. Best MVP Definition

The MVP should answer one simple question:

> "Can a person securely create emergency information, generate a protected QR code, and let another person scan and unlock that information without internet?"

If yes, the core product works.

### MVP success criteria

```text
✓ Works offline
✓ Information stored locally
✓ App protected
✓ QR protected
✓ QR can be scanned
✓ Password required
✓ Information decrypted correctly
✓ Emergency contact can be called
✓ No unnecessary server
✓ Simple interface
```

---

# 56. Future Product Vision

The long-term vision can be:

**"A privacy-first emergency identity card that works even when the internet does not."**

Possible future ecosystem:

```text
                    SafeCard
                       │
       ┌───────────────┼────────────────┐
       │               │                │
   Personal        Family           Travel
    Cards          Cards             Cards
       │               │                │
       └───────────────┼────────────────┘
                       │
                  Secure QR
                       │
          ┌────────────┼────────────┐
          │            │            │
       Mobile       Desktop      Printed
          │            │            │
          └────────────┼────────────┘
                       │
                 Emergency Help
```

---

# 57. Final Product Principles

The application should always follow these principles:

1. **Privacy first**
2. **Offline first**
3. **Emergency information first**
4. **User controls what is shared**
5. **No unnecessary personal-data collection**
6. **Simple UI**
7. **Strong encryption**
8. **Separate app security from QR sharing security**
9. **Accessible to ordinary users**
10. **Never claim more security or emergency capability than the implementation actually provides**

---

# 58. Final Recommended Project Name Ideas

- SafeCard
- EmergencyCard
- LifeCard
- QuickID
- HelpCard
- SafeQR
- LifeQR
- Emergency Pass
- MyEmergency
- ReadyCard

**Recommended:** `SafeCard`

Short, memorable, and communicates the purpose clearly.

---

# 59. One-Sentence Product Description

> **SafeCard is a privacy-first, offline emergency information card application that lets users securely store important emergency details locally and share selected information through a password-protected encrypted QR code.**

