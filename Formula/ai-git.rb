class AiGit < Formula
  desc "A CLI tool that leverages Gemini 2.5 Flash to automatically generate semantically correct, Conventional Commits-compliant git messages from staged changes."
  homepage "https://github.com/sadiksaifi/ai-git"
  version 0.1.0

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.1.0/ai-git-darwin-arm64.tar.gz"
      sha256 "fe5d5d1c5d4f20fe04c1bb939652ab0fcfc458a017991deade0c104421cd6e93"
    else
      url "https://github.com/sadiksaifi/ai-git/releases/download/v0.1.0/ai-git-darwin-x64.tar.gz"
      sha256 "c97cff201e2e931453c0d17bf3020acb13b64360291306707730caaf34353334"
    end
  end

  def install
    bin.install "ai-git"
  end
end
