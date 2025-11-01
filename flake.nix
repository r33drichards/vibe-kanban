{
  description = "Vibe Kanban - AI-powered task management with kanban board";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, flake-utils, rust-overlay }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs {
          inherit system overlays;
        };

        # Use the specific nightly toolchain version from rust-toolchain.toml
        rustToolchain = pkgs.rust-bin.nightly."2025-05-18".default.override {
          extensions = [ "rust-src" "rust-analyzer" ];
        };

        # Build dependencies
        nativeBuildInputs = with pkgs; [
          rustToolchain
          pkg-config
          nodejs_20
          pnpm
          cargo-watch
          sqlx-cli
          git
          # For bindgen (used by libsqlite3-sys)
          llvmPackages.libclang
          # For compiling C code (ring crate needs this)
          gcc
          binutils
        ];

        # Runtime dependencies
        buildInputs = with pkgs; [
          openssl
          openssl.dev
          sqlite
          libgit2
          libssh2
          zlib
        ] ++ lib.optionals pkgs.stdenv.isDarwin [
          pkgs.darwin.apple_sdk.frameworks.Security
          pkgs.darwin.apple_sdk.frameworks.SystemConfiguration
        ];

      in
      {
        devShells.default = pkgs.mkShell {
          inherit buildInputs nativeBuildInputs;

          # Environment variables
          shellHook = ''
            echo "🚀 Vibe Kanban development environment"
            echo ""
            echo "Available commands:"
            echo "  pnpm run dev          - Start development servers (frontend + backend)"
            echo "  pnpm run check        - Run all checks (frontend + backend)"
            echo "  pnpm run frontend:dev - Start frontend only"
            echo "  pnpm run backend:dev  - Start backend only"
            echo ""
            echo "Node version: $(node --version)"
            echo "pnpm version: $(pnpm --version)"
            echo "Rust version: $(rustc --version)"
            echo ""

            # Set up environment for SQLx
            export DATABASE_URL="sqlite:dev_assets_seed/vibe-kanban.db"

            # Set up libclang for bindgen (required for libsqlite3-sys)
            export LIBCLANG_PATH="${pkgs.llvmPackages.libclang.lib}/lib"

            # Ensure C compiler can find standard library headers
            export C_INCLUDE_PATH="${pkgs.glibc.dev}/include:${pkgs.gcc.cc}/include"
            export CPLUS_INCLUDE_PATH="${pkgs.glibc.dev}/include:${pkgs.gcc.cc}/include"

            # Tell Rust -sys crates to use Nix-provided libraries instead of compiling from source
            export OPENSSL_DIR="${pkgs.openssl.dev}"
            export OPENSSL_LIB_DIR="${pkgs.openssl.out}/lib"
            export OPENSSL_INCLUDE_DIR="${pkgs.openssl.dev}/include"
            export OPENSSL_NO_VENDOR=1

            export LIBGIT2_SYS_USE_PKG_CONFIG=1
            export LIBSSH2_SYS_USE_PKG_CONFIG=1
            export LIBSQLITE3_SYS_USE_PKG_CONFIG=1

            export PKG_CONFIG_PATH="${pkgs.openssl.dev}/lib/pkgconfig:${pkgs.libgit2}/lib/pkgconfig:${pkgs.libssh2}/lib/pkgconfig:${pkgs.sqlite.dev}/lib/pkgconfig"

            # Set up LD_LIBRARY_PATH for runtime linking
            export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath buildInputs}:$LD_LIBRARY_PATH"

            # Ensure pnpm is set up
            if [ ! -d "node_modules" ]; then
              echo "📦 Installing dependencies..."
              pnpm install
            fi
          '';
        };

        # Optional: Add a package output for the application
        packages.default = pkgs.stdenv.mkDerivation {
          pname = "vibe-kanban";
          version = "0.0.114";

          src = ./.;

          inherit nativeBuildInputs buildInputs;

          buildPhase = ''
            export HOME=$TMPDIR
            pnpm install --frozen-lockfile
            pnpm run build:npx
          '';

          installPhase = ''
            mkdir -p $out/bin
            cp -r npx-cli/dist $out/
            cp -r npx-cli/bin $out/
            chmod +x $out/bin/cli.js
          '';
        };
      }
    );
}
