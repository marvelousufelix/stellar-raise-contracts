import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MilestoneSocialSharing, MilestoneShareData, ShareMetrics } from "./milestone_social_sharing";

describe("MilestoneSocialSharing", () => {
  const mockData: MilestoneShareData = {
    campaignId: "campaign-123",
    campaignName: "Amazing Project",
    currentAmount: 2500,
    goalAmount: 5000,
    milestonePercentage: 50,
    creatorName: "John Doe",
  };

  const mockOnShare = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(window, "open", {
      value: jest.fn(),
      writable: true,
    });
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
      writable: true,
    });
  });

  describe("Rendering", () => {
    it("should render the component with all share buttons", () => {
      render(<MilestoneSocialSharing data={mockData} />);

      expect(screen.getByLabelText("Share on Twitter")).toBeInTheDocument();
      expect(screen.getByLabelText("Share on Facebook")).toBeInTheDocument();
      expect(screen.getByLabelText("Share on LinkedIn")).toBeInTheDocument();
      expect(screen.getByLabelText("Share via email")).toBeInTheDocument();
      expect(screen.getByLabelText("Copy share link")).toBeInTheDocument();
    });

    it("should display the correct milestone message for 50%", () => {
      render(<MilestoneSocialSharing data={mockData} />);
      expect(screen.getByText(/halfway there at 50%/i)).toBeInTheDocument();
    });

    it("should display 25% milestone message", () => {
      const data = { ...mockData, milestonePercentage: 25 };
      render(<MilestoneSocialSharing data={data} />);
      expect(screen.getByText(/hit 25% funding/i)).toBeInTheDocument();
    });

    it("should display 75% milestone message", () => {
      const data = { ...mockData, milestonePercentage: 75 };
      render(<MilestoneSocialSharing data={data} />);
      expect(screen.getByText(/at 75%/i)).toBeInTheDocument();
    });

    it("should display 100% milestone message", () => {
      const data = { ...mockData, milestonePercentage: 100 };
      render(<MilestoneSocialSharing data={data} />);
      expect(screen.getByText(/reached 100% funding/i)).toBeInTheDocument();
    });

    it("should have proper accessibility attributes", () => {
      render(<MilestoneSocialSharing data={mockData} />);
      const region = screen.getByRole("region", { name: /Share milestone achievement/i });
      expect(region).toBeInTheDocument();
    });

    it("should disable buttons when disabled prop is true", () => {
      render(<MilestoneSocialSharing data={mockData} disabled={true} />);

      const buttons = screen.getAllByRole("button");
      buttons.forEach((btn) => {
        expect(btn).toBeDisabled();
      });
    });
  });

  describe("Share Functionality", () => {
    it("should call onShare callback when Twitter button is clicked", async () => {
      render(<MilestoneSocialSharing data={mockData} onShare={mockOnShare} />);

      const twitterBtn = screen.getByLabelText("Share on Twitter");
      fireEvent.click(twitterBtn);

      await waitFor(() => {
        expect(mockOnShare).toHaveBeenCalledWith(
          expect.objectContaining({
            platform: "twitter",
            campaignId: mockData.campaignId,
          })
        );
      });
    });

    it("should open Twitter share URL with correct parameters", async () => {
      render(<MilestoneSocialSharing data={mockData} onShare={mockOnShare} />);

      const twitterBtn = screen.getByLabelText("Share on Twitter");
      fireEvent.click(twitterBtn);

      await waitFor(() => {
        expect(window.open).toHaveBeenCalledWith(
          expect.stringContaining("twitter.com/intent/tweet"),
          "_blank",
          "noopener,noreferrer"
        );
      });
    });

    it("should open Facebook share URL", async () => {
      render(<MilestoneSocialSharing data={mockData} onShare={mockOnShare} />);

      const facebookBtn = screen.getByLabelText("Share on Facebook");
      fireEvent.click(facebookBtn);

      await waitFor(() => {
        expect(window.open).toHaveBeenCalledWith(
          expect.stringContaining("facebook.com/sharer"),
          "_blank",
          "noopener,noreferrer"
        );
      });
    });

    it("should open LinkedIn share URL", async () => {
      render(<MilestoneSocialSharing data={mockData} onShare={mockOnShare} />);

      const linkedinBtn = screen.getByLabelText("Share on LinkedIn");
      fireEvent.click(linkedinBtn);

      await waitFor(() => {
        expect(window.open).toHaveBeenCalledWith(
          expect.stringContaining("linkedin.com/sharing"),
          "_blank",
          "noopener,noreferrer"
        );
      });
    });

    it("should open email client with correct subject and body", async () => {
      render(<MilestoneSocialSharing data={mockData} onShare={mockOnShare} />);

      const emailBtn = screen.getByLabelText("Share via email");
      fireEvent.click(emailBtn);

      await waitFor(() => {
        expect(window.open).toHaveBeenCalledWith(
          expect.stringContaining("mailto:"),
          "_blank",
          "noopener,noreferrer"
        );
      });
    });

    it("should copy to clipboard when copy button is clicked", async () => {
      render(<MilestoneSocialSharing data={mockData} onShare={mockOnShare} />);

      const copyBtn = screen.getByLabelText("Copy share link");
      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalled();
      });
    });
  });

  describe("Input Sanitization", () => {
    it("should sanitize campaign name with special characters", () => {
      const data = {
        ...mockData,
        campaignName: '<script>alert("xss")</script>Project',
      };
      render(<MilestoneSocialSharing data={data} />);

      const text = screen.getByText(/Project/i);
      expect(text.textContent).not.toContain("<script>");
    });

    it("should truncate long campaign names", () => {
      const longName = "A".repeat(100);
      const data = { ...mockData, campaignName: longName };
      render(<MilestoneSocialSharing data={data} />);

      const text = screen.getByText(/A+/);
      expect(text.textContent?.length).toBeLessThanOrEqual(60);
    });

    it("should sanitize creator name", () => {
      const data = {
        ...mockData,
        creatorName: '<img src=x onerror="alert(1)">John',
      };
      render(<MilestoneSocialSharing data={data} />);

      const text = screen.getByText(/John/i);
      expect(text.textContent).not.toContain("<img");
    });

    it("should handle empty campaign name gracefully", () => {
      const data = { ...mockData, campaignName: "" };
      render(<MilestoneSocialSharing data={data} />);

      expect(screen.getByRole("region")).toBeInTheDocument();
    });

    it("should handle null/undefined values gracefully", () => {
      const data = {
        ...mockData,
        campaignName: undefined as any,
        creatorName: null as any,
      };
      render(<MilestoneSocialSharing data={data} />);

      expect(screen.getByRole("region")).toBeInTheDocument();
    });
  });

  describe("Keyboard Navigation", () => {
    it("should support keyboard navigation through buttons", async () => {
      const user = userEvent.setup();
      render(<MilestoneSocialSharing data={mockData} onShare={mockOnShare} />);

      const twitterBtn = screen.getByLabelText("Share on Twitter");
      await user.tab();
      expect(twitterBtn).toHaveFocus();
    });

    it("should trigger share on Enter key", async () => {
      const user = userEvent.setup();
      render(<MilestoneSocialSharing data={mockData} onShare={mockOnShare} />);

      const twitterBtn = screen.getByLabelText("Share on Twitter");
      twitterBtn.focus();
      await user.keyboard("{Enter}");

      await waitFor(() => {
        expect(mockOnShare).toHaveBeenCalled();
      });
    });

    it("should trigger share on Space key", async () => {
      const user = userEvent.setup();
      render(<MilestoneSocialSharing data={mockData} onShare={mockOnShare} />);

      const twitterBtn = screen.getByLabelText("Share on Twitter");
      twitterBtn.focus();
      await user.keyboard(" ");

      await waitFor(() => {
        expect(mockOnShare).toHaveBeenCalled();
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle milestone percentage > 100", () => {
      const data = { ...mockData, milestonePercentage: 150 };
      render(<MilestoneSocialSharing data={data} />);

      expect(screen.getByRole("region")).toBeInTheDocument();
    });

    it("should handle milestone percentage < 0", () => {
      const data = { ...mockData, milestonePercentage: -50 };
      render(<MilestoneSocialSharing data={data} />);

      expect(screen.getByRole("region")).toBeInTheDocument();
    });

    it("should handle custom campaign URL", () => {
      const customUrl = "https://custom-domain.com/campaign/123";
      render(
        <MilestoneSocialSharing data={mockData} campaignUrl={customUrl} onShare={mockOnShare} />
      );

      const twitterBtn = screen.getByLabelText("Share on Twitter");
      fireEvent.click(twitterBtn);

      expect(window.open).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent(customUrl)),
        "_blank",
        "noopener,noreferrer"
      );
    });

    it("should handle clipboard write failure gracefully", async () => {
      (navigator.clipboard.writeText as jest.Mock).mockRejectedValueOnce(
        new Error("Clipboard error")
      );

      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      render(<MilestoneSocialSharing data={mockData} onShare={mockOnShare} />);

      const copyBtn = screen.getByLabelText("Copy share link");
      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith("Failed to copy to clipboard");
      });

      consoleSpy.mockRestore();
    });

    it("should record correct timestamp in metrics", async () => {
      const beforeTime = Date.now();
      render(<MilestoneSocialSharing data={mockData} onShare={mockOnShare} />);

      const twitterBtn = screen.getByLabelText("Share on Twitter");
      fireEvent.click(twitterBtn);

      await waitFor(() => {
        expect(mockOnShare).toHaveBeenCalledWith(
          expect.objectContaining({
            timestamp: expect.any(Number),
          })
        );

        const call = mockOnShare.mock.calls[0][0];
        expect(call.timestamp).toBeGreaterThanOrEqual(beforeTime);
        expect(call.timestamp).toBeLessThanOrEqual(Date.now());
      });
    });
  });

  describe("Multiple Shares", () => {
    it("should handle multiple consecutive shares", async () => {
      render(<MilestoneSocialSharing data={mockData} onShare={mockOnShare} />);

      const twitterBtn = screen.getByLabelText("Share on Twitter");
      const facebookBtn = screen.getByLabelText("Share on Facebook");

      fireEvent.click(twitterBtn);
      fireEvent.click(facebookBtn);

      await waitFor(() => {
        expect(mockOnShare).toHaveBeenCalledTimes(2);
      });
    });

    it("should track different platforms in metrics", async () => {
      render(<MilestoneSocialSharing data={mockData} onShare={mockOnShare} />);

      const twitterBtn = screen.getByLabelText("Share on Twitter");
      const linkedinBtn = screen.getByLabelText("Share on LinkedIn");

      fireEvent.click(twitterBtn);
      fireEvent.click(linkedinBtn);

      await waitFor(() => {
        expect(mockOnShare).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ platform: "twitter" })
        );
        expect(mockOnShare).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ platform: "linkedin" })
        );
      });
    });
  });

  describe("Responsive Design", () => {
    it("should render buttons in a flex container", () => {
      const { container } = render(<MilestoneSocialSharing data={mockData} />);
      const buttonsContainer = container.querySelector(".share-buttons");
      expect(buttonsContainer).toHaveStyle("display: flex");
    });

    it("should have proper spacing between buttons", () => {
      const { container } = render(<MilestoneSocialSharing data={mockData} />);
      const buttonsContainer = container.querySelector(".share-buttons");
      expect(buttonsContainer).toHaveStyle("gap: 0.5rem");
    });
  });
});
