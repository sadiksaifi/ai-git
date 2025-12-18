class AiGit < Formula
  desc "A CLI tool that leverages AI to automatically generate semantically correct, Conventional Commits compliant git messages."
  homepage "https://github.com/sadiksaifi/ai-git"
  version "0.10.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.10.0/ai-git-darwin-arm64.tar.gz"
      sha256 "c5290a280e9d813ce715cd09a8c523b385a4f119d83590d295e22986b2076f28"
    else
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.10.0/ai-git-darwin-x64.tar.gz"
      sha256 "8f97cc68e7e35cf6dab8e8425466be7ff529f404a46b71d928c893c4ba92de0c"
    end
  end

  def install
    bin.install "ai-git"
  end
end
