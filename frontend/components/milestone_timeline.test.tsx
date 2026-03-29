import React from 'react';
import { render, screen } from '@testing-library/react';
import { MilestoneTimeline } from './milestone_timeline';

describe('MilestoneTimeline', () => {
  it('renders milestone timeline component', () => {
    render(
      <MilestoneTimeline currentAmount={500} goalAmount={1000} />
    );
    expect(screen.getByText('Campaign Progress')).toBeInTheDocument();
  });

  it('calculates progress correctly', () => {
    render(
      <MilestoneTimeline currentAmount={500} goalAmount={1000} />
    );
    expect(screen.getByText('50% of goal reached')).toBeInTheDocument();
  });

  it('displays all default milestones', () => {
    render(
      <MilestoneTimeline currentAmount={500} goalAmount={1000} />
    );
    expect(screen.getByTestId('milestone-25')).toBeInTheDocument();
    expect(screen.getByTestId('milestone-50')).toBeInTheDocument();
    expect(screen.getByTestId('milestone-75')).toBeInTheDocument();
    expect(screen.getByTestId('milestone-100')).toBeInTheDocument();
  });

  it('marks reached milestones', () => {
    render(
      <MilestoneTimeline currentAmount={750} goalAmount={1000} />
    );
    const milestone25 = screen.getByTestId('milestone-25');
    const milestone75 = screen.getByTestId('milestone-75');
    
    expect(milestone25).toHaveClass('reached');
    expect(milestone75).toHaveClass('reached');
  });

  it('marks pending milestones', () => {
    render(
      <MilestoneTimeline currentAmount={250} goalAmount={1000} />
    );
    const milestone50 = screen.getByTestId('milestone-50');
    
    expect(milestone50).toHaveClass('pending');
  });

  it('displays celebration icon for reached milestones', () => {
    render(
      <MilestoneTimeline currentAmount={500} goalAmount={1000} />
    );
    const milestone50 = screen.getByTestId('milestone-50');
    
    expect(milestone50.querySelector('.celebration-icon')).toBeInTheDocument();
  });

  it('displays correct stats', () => {
    render(
      <MilestoneTimeline currentAmount={500} goalAmount={1000} />
    );
    const stats = screen.getAllByText(/500/);
    expect(stats.length).toBeGreaterThan(0);
    expect(screen.getByText(/1,000/)).toBeInTheDocument();
  });

  it('handles custom milestones', () => {
    render(
      <MilestoneTimeline
        currentAmount={500}
        goalAmount={1000}
        milestones={[10, 50, 90]}
      />
    );
    expect(screen.getByTestId('milestone-10')).toBeInTheDocument();
    expect(screen.getByTestId('milestone-50')).toBeInTheDocument();
    expect(screen.getByTestId('milestone-90')).toBeInTheDocument();
  });

  it('handles zero goal amount', () => {
    render(
      <MilestoneTimeline currentAmount={500} goalAmount={0} />
    );
    expect(screen.getByText('0% of goal reached')).toBeInTheDocument();
  });

  it('caps progress at 100%', () => {
    render(
      <MilestoneTimeline currentAmount={1500} goalAmount={1000} />
    );
    expect(screen.getByText('100% of goal reached')).toBeInTheDocument();
  });

  it('calls onMilestoneReached callback', () => {
    const callback = jest.fn();
    render(
      <MilestoneTimeline
        currentAmount={500}
        goalAmount={1000}
        onMilestoneReached={callback}
      />
    );
    expect(callback).toHaveBeenCalled();
  });

  it('displays milestone descriptions', () => {
    render(
      <MilestoneTimeline currentAmount={500} goalAmount={1000} />
    );
    expect(screen.getByText('Halfway there! Keep the momentum going')).toBeInTheDocument();
  });

  it('has accessible progress bar', () => {
    render(
      <MilestoneTimeline currentAmount={500} goalAmount={1000} />
    );
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '50');
    expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    expect(progressBar).toHaveAttribute('aria-valuemax', '100');
  });

  it('formats currency correctly', () => {
    render(
      <MilestoneTimeline currentAmount={1000000} goalAmount={5000000} />
    );
    expect(screen.getByText(/1,000,000/)).toBeInTheDocument();
    expect(screen.getByText(/5,000,000/)).toBeInTheDocument();
  });

  it('updates when props change', () => {
    const { rerender } = render(
      <MilestoneTimeline currentAmount={250} goalAmount={1000} />
    );
    expect(screen.getByText('25% of goal reached')).toBeInTheDocument();

    rerender(
      <MilestoneTimeline currentAmount={500} goalAmount={1000} />
    );
    expect(screen.getByText('50% of goal reached')).toBeInTheDocument();
  });
});
