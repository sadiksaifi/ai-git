class AiGit < Formula
  desc "A CLI tool that leverages AI to automatically generate semantically correct, Conventional Commits compliant git messages."
  homepage "https://github.com/sadiksaifi/ai-git"
  version "0.11.1"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.11.1/ai-git-darwin-arm64.tar.gz"
      sha256 "9ca7abf858a22c345fca95910a5826317d017343fb65ba44d777fd7e85a69301"
    else
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.11.1/ai-git-darwin-x64.tar.gz"
      sha256 "760ced2d0a4f6522cb9df946492ea9bf881c85f22e697af420c221c6cd9aa191"
    end
  end

  def install
    bin.install "ai-git"
  end
end
