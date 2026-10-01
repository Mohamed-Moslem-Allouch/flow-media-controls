# Contributing to Flow — Media Controls

Thank you for your interest in contributing to **Flow**! This document provides guidelines and steps for reporting issues, suggesting improvements, and submitting pull requests.

Project maintained and authored by **Mohamed Moslem Allouch**.

---

## 🛠️ Getting Started

### 1. Fork and Clone
```bash
git clone https://github.com/Mohamed-Moslem-Allouch/flow-media-controls.git
cd flow-media-controls
```

### 2. Load Extension in Google Chrome
1. Navigate to `chrome://extensions/` in Chrome.
2. Toggle on **Developer mode** in the upper-right corner.
3. Click **Load unpacked**.
4. Select the repository root folder.

### 3. Verify Code Quality
Run the built-in syntax check:
```bash
npm run lint
```

---

## 📋 Development Workflow

1. **Create a branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. **Make your changes**:
   - Follow clean, vanilla JavaScript (ES2022+) best practices.
   - Maintain strict separation of concerns between `background/`, `content/`, and `popup/`.
   - Ensure light & dark adaptive theme compatibility in `content/overlay.css`.
3. **Test thoroughly**:
   - Test on Instagram (Stories, Reels `/reels`, Feed).
   - Test on Facebook (Stories with vertical volume capsule).
4. **Commit with conventional messages**:
   ```bash
   git commit -m "feat(reels): add adaptive speed indicator"
   ```
5. **Push and open a Pull Request**:
   ```bash
   git push origin feature/your-feature-name
   ```

---

## 📜 Code of Conduct

- Be respectful and constructive in issues and discussions.
- Provide clear reproducible steps and browser versions when reporting bugs.

---

## 📄 License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
