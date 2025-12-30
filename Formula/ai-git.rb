class AiGit < Formula
  desc "A CLI tool that leverages AI to automatically generate semantically correct, Conventional Commits compliant git messages."
  homepage "https://github.com/sadiksaifi/ai-git"
  version "1.0.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sadiksaifi/ai-git/releases/download/v1.0.0/ai-git-darwin-arm64.tar.gz"
      sha256 "fdca9be8ca79860208519498a22b56a4d316112edb55c10a11952ce2c798496e"
    else
      url "https://github.com/sadiksaifi/ai-git/releases/download/v1.0.0/ai-git-darwin-x64.tar.gz"
      sha256 "0f30a46738eda9015199e1b427fd99e8917f67af6d0f297fc60e7680bec7ecc4"
    end
  end

  def install
    bin.install "ai-git"
  end
end
