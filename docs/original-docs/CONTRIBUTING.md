# Contributing to OpenCloud Archive Viewer

> **Original uploaded doc — not verified against the code.** For the actual current state see [project status](../overview/project-status.md) and the index in `CLAUDE.md`.

Thank you for your interest in contributing to OpenCloud Archive Viewer! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors.

## How to Contribute

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include:

- **Clear title and description**
- **Steps to reproduce** the issue
- **Expected behavior** vs actual behavior
- **Screenshots** if applicable
- **Environment details** (browser, OS, OpenCloud version)
- **Archive file format** that caused the issue (if applicable)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, include:

- **Clear title and description**
- **Use case** and rationale
- **Mockups or examples** if applicable
- **Potential implementation approach**

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Follow the code style** (use ESLint and Prettier)
3. **Add tests** for new functionality
4. **Update documentation** as needed
5. **Ensure all tests pass** before submitting
6. **Write clear commit messages**

## Development Setup

### Prerequisites

- Node.js 18+
- pnpm 9.0.0+
- Git
- Docker (optional, for testing deployment)

### Setup Steps

1. Fork and clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/web-app-archive-viewer.git
cd web-app-archive-viewer
```

2. Install dependencies:
```bash
pnpm install
```

3. Start development server:
```bash
pnpm build:w
```

4. Run tests:
```bash
pnpm test
```

### Project Structure

```
web-app-archive-viewer/
├── src/
│   ├── index.ts              # Main entry point
│   ├── views/                # Vue components
│   │   └── ArchiveViewer.vue # Main viewer component
│   ├── types.d.ts            # TypeScript definitions
│   └── translations.json     # i18n translations
├── public/                   # Static assets
├── tests/                    # Test files
├── package.json              # Dependencies
├── vite.config.ts           # Build configuration
├── tsconfig.json            # TypeScript configuration
└── README.md                # Documentation
```

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Provide proper type definitions
- Avoid using `any` type when possible
- Use interfaces for object types

### Vue Components

- Use Composition API with `<script setup>` when possible
- Keep components focused and single-responsibility
- Use proper prop validation
- Emit events for parent communication

### Code Style

The project uses ESLint and Prettier for code formatting:

```bash
# Check linting
pnpm lint

# Format code
pnpm format
```

### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
feat: add support for password-protected archives
fix: resolve memory leak in file extraction
docs: update installation instructions
style: format code with prettier
refactor: simplify archive parsing logic
test: add unit tests for file preview
chore: update dependencies
```

## Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Watch mode
pnpm test:watch
```

### Writing Tests

- Place tests in `tests/unit/` directory
- Use descriptive test names
- Test edge cases and error conditions
- Aim for >80% code coverage

Example test structure:

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ArchiveViewer from '@/views/ArchiveViewer.vue'

describe('ArchiveViewer', () => {
  it('renders correctly', () => {
    const wrapper = mount(ArchiveViewer)
    expect(wrapper.exists()).toBe(true)
  })

  it('displays archive name', async () => {
    const wrapper = mount(ArchiveViewer)
    // Test implementation
  })
})
```

## Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for public APIs
- Update CHANGELOG.md for notable changes
- Include examples for new features

## Adding New Features

### Archive Format Support

To add support for a new archive format:

1. Verify libarchive.js supports the format
2. Add MIME type to `manifest.json`
3. Add extension to `src/index.ts`
4. Update documentation
5. Add test cases

### UI Components

When adding new UI components:

1. Use OpenCloud Web design system components
2. Ensure accessibility (ARIA labels, keyboard navigation)
3. Support responsive design
4. Test in multiple browsers
5. Add i18n support for all text

## Internationalization (i18n)

To add a new language:

1. Add translations to `src/translations.json`
2. Follow existing structure
3. Test all UI strings are translated
4. Update README with supported languages

## Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create git tag: `git tag v1.x.x`
4. Push tag: `git push origin v1.x.x`
5. GitHub Actions will create release

## Questions?

- Open a [Discussion](https://github.com/opencloud-eu/web-app-archive-viewer/discussions)
- Join the [OpenCloud Matrix channel](https://matrix.to/#/#opencloud:matrix.org)
- Email: community@opencloud.eu

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.

## Recognition

Contributors will be recognized in:
- README.md contributors section
- Release notes
- Project documentation

Thank you for contributing to OpenCloud Archive Viewer! 🎉
