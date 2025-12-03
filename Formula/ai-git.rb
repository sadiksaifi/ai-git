class AiGit < Formula
  desc "A CLI tool that leverages Gemini 2.5 Flash to automatically generate semantically correct, Conventional Commits-compliant git messages from staged changes."
  homepage "https://github.com/sadiksaifi/ai-git"
  version "0.0.0"

  on_macos do
    if Hardware::CPU.arm?
      url "REPLACE_URL_ARM64"
      sha256 "REPLACE_SHA256_ARM64"
    else
      url "REPLACE_URL_X64"
      sha256 "REPLACE_SHA256_X64"
    end
  end

  def install
    bin.install "ai-git"
  end
end
