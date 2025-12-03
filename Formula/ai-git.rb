class AiGit < Formula
  desc "A CLI tool that leverages AI to automatically generate semantically correct, Conventional Commits compliant git messages."
  homepage "https://github.com/sadiksaifi/ai-git"
  version "0.2.2"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.2.2/ai-git-darwin-arm64.tar.gz"
      sha256 "8e09f02a7cdb40c50b0855e819cf17c31b05a0ea884d0f4ff329a3cb2c49b2e7"
    else
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.2.2/ai-git-darwin-x64.tar.gz"
      sha256 "a51f8cf40f8c63a7cf33499c285fe5882323f0c725e9cf0894cc9874bbfe3f46"
    end
  end

  def install
    bin.install "ai-git"
  end
end
